"""One disposable scraper process per authenticated search."""
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
import json
import logging
import multiprocessing
from multiprocessing.connection import wait
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


def _site_worker(options, site, result_pipe):
    try:
        result = (site, _scrape_one(options, site), None)
    except Exception as error:
        result = (site, None, type(error).__name__)
    try:
        result_pipe.send(result)
    finally:
        result_pipe.close()


def scrape(options):
    # Each adapter gets its own process. Threads cannot be force-stopped when a
    # scraper socket hangs; processes can, and all descendants are joined before
    # this worker exits.
    context = multiprocessing.get_context("fork")
    # Vercel does not provide the filesystem-backed POSIX semaphores used by
    # multiprocessing.Queue. One-way pipes only need ordinary file descriptors.
    processes = {}
    receivers = {}
    jobs = []
    succeeded_sites = []
    site_errors = {}
    deadline = time.monotonic() + SITE_COLLECTION_TIMEOUT
    try:
        for site in options["site_name"]:
            receiver, sender = context.Pipe(duplex=False)
            process = context.Process(target=_site_worker, args=(options, site, sender), daemon=True)
            receivers[receiver] = site
            try:
                process.start()
                processes[site] = process
            finally:
                sender.close()
        while receivers:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            ready = wait(list(receivers), timeout=remaining)
            if not ready:
                break
            for receiver in ready:
                site = receivers.pop(receiver)
                try:
                    _, site_jobs, error = receiver.recv()
                except EOFError:
                    site_jobs, error = None, "WorkerExited"
                finally:
                    receiver.close()
                if error:
                    site_errors[site] = error
                else:
                    succeeded_sites.append(site)
                    jobs.extend(site_jobs)
        for site in receivers.values():
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
        for receiver in receivers:
            receiver.close()

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
