"""One disposable scraper process per authenticated search."""
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
import json
import logging
import multiprocessing
import queue
import sys
import time


# Leave four seconds for process startup, JSON output, and the FastAPI wrapper
# to collect/kill this worker below its 22-second outer timeout.
SITE_COLLECTION_TIMEOUT = 18


class ScraperErrors(logging.Handler):
    def __init__(self):
        super().__init__(logging.ERROR)
        self.failed = False

    def emit(self, record):
        self.failed = True


def _scrape_one(options, site):
    from jobspy import scrape_jobs
    import pandas as pd

    # JobSpy uses its own loggers; some return an empty frame after logging an
    # upstream error. Scrape boards separately so one broken adapter does not
    # discard useful results from every other board.
    loggers = [logging.getLogger("JobSpy"), logging.getLogger("JobSpy:Indeed"),
               logging.getLogger("JobSpy:LinkedIn"), logging.getLogger("JobSpy:ZipRecruiter"),
               logging.getLogger("JobSpy:Google"), logging.getLogger("JobSpy:Bayt"),
               logging.getLogger("JobSpy:Naukri")]
    args = dict(options, description_format="html", enforce_annual_salary=True, verbose=0)
    errors = ScraperErrors()
    for logger in loggers:
        logger.addHandler(errors)
    try:
        site_args = dict(args, site_name=[site])
        # Indeed cannot combine hours_old with is_remote/job_type. Preserve
        # remote filtering at source, then apply the date limit locally.
        if site == "indeed" and (site_args["is_remote"] or site_args["job_type"]):
            site_args["hours_old"] = None
        with redirect_stdout(sys.stderr):
            frame = scrape_jobs(**site_args)
        if errors.failed:
            raise RuntimeError("scraper error")
        if options["is_remote"] and "is_remote" not in frame.columns:
            raise RuntimeError("missing is_remote field")
        if options["hours_old"] and "date_posted" not in frame.columns:
            raise RuntimeError("missing date_posted field")
        if options["is_remote"]:
            frame = frame.loc[frame["is_remote"].eq(True)]
        if options["hours_old"]:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=options["hours_old"])).date()
            posted = pd.to_datetime(frame["date_posted"], errors="coerce", utc=True)
            frame = frame.loc[posted.dt.date.ge(cutoff)]
        return json.loads(frame.to_json(orient="records", date_format="iso"))
    finally:
        for logger in loggers:
            logger.removeHandler(errors)


def _site_worker(options, site, results):
    try:
        results.put((site, _scrape_one(options, site), None))
    except Exception as error:
        results.put((site, None, type(error).__name__))


def scrape(options):
    # Each adapter gets its own process. Threads cannot be force-stopped when a
    # scraper socket hangs; processes can, and all descendants are joined before
    # this worker exits.
    context = multiprocessing.get_context("fork")
    results = context.Queue()
    processes = {
        site: context.Process(target=_site_worker, args=(options, site, results), daemon=True)
        for site in options["site_name"]
    }
    for process in processes.values():
        process.start()

    jobs = []
    succeeded_sites = []
    site_errors = {}
    pending = set(processes)
    deadline = time.monotonic() + SITE_COLLECTION_TIMEOUT
    try:
        while pending:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                site, site_jobs, error = results.get(timeout=remaining)
            except queue.Empty:
                break
            if site not in pending:
                continue
            pending.remove(site)
            if error:
                site_errors[site] = error
            else:
                succeeded_sites.append(site)
                jobs.extend(site_jobs)
        for site in pending:
            site_errors[site] = "TimeoutError"
    finally:
        for process in processes.values():
            if process.is_alive():
                process.terminate()
        for process in processes.values():
            process.join(timeout=0.5)
            if process.is_alive():
                process.kill()
                process.join()
        results.close()
        results.join_thread()

    if not succeeded_sites:
        raise RuntimeError("All job boards failed")
    return {
        "jobs": jobs,
        "attempted_sites": list(options["site_name"]),
        "succeeded_sites": succeeded_sites,
        "errors": site_errors,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(scrape(json.load(sys.stdin)), allow_nan=False))
    except Exception as error:
        # Log only the exception class; don't echo request data or credentials.
        print(f"JobSpy worker failed: {type(error).__name__}", file=sys.stderr)
        sys.exit(1)
