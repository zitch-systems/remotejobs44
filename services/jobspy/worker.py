"""One disposable scraper process per authenticated search."""
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
import json
import logging
import sys


class ScraperErrors(logging.Handler):
    def __init__(self):
        super().__init__(logging.ERROR)
        self.failed = False

    def emit(self, record):
        self.failed = True


def scrape(options):
    from jobspy import scrape_jobs
    import pandas as pd

    errors = ScraperErrors()
    # JobSpy uses its own loggers; some return an empty frame after logging an
    # upstream error. Don't report those failures as successful empty searches.
    loggers = [logging.getLogger("JobSpy"), logging.getLogger("JobSpy:Indeed"),
               logging.getLogger("JobSpy:LinkedIn"), logging.getLogger("JobSpy:ZipRecruiter"),
               logging.getLogger("JobSpy:Google"), logging.getLogger("JobSpy:Bayt"),
               logging.getLogger("JobSpy:Naukri")]
    for logger in loggers:
        logger.addHandler(errors)
    args = dict(options, description_format="html", enforce_annual_salary=True, verbose=0)
    # Indeed cannot combine hours_old with is_remote/job_type. Preserve remote
    # filtering at source, then apply the requested date limit to returned rows.
    if "indeed" in args["site_name"] and (args["is_remote"] or args["job_type"]):
        args["hours_old"] = None
    try:
        with redirect_stdout(sys.stderr):
            frame = scrape_jobs(**args)
        if errors.failed:
            raise RuntimeError("One or more job boards reported a scraper error")
        if options["is_remote"]:
            if "is_remote" not in frame.columns:
                frame = frame.iloc[0:0]
            else:
                frame = frame.loc[frame["is_remote"].eq(True)]
        if options["hours_old"]:
            if "date_posted" not in frame.columns:
                frame = frame.iloc[0:0]
            else:
                cutoff = (datetime.now(timezone.utc) - timedelta(hours=options["hours_old"])).date()
                posted = pd.to_datetime(frame["date_posted"], errors="coerce", utc=True)
                frame = frame.loc[posted.dt.date.ge(cutoff)]
        # pandas handles NaN/NaT/numpy scalars and serializes dates safely.
        return {"jobs": json.loads(frame.to_json(orient="records", date_format="iso"))}
    finally:
        for logger in loggers:
            logger.removeHandler(errors)


if __name__ == "__main__":
    try:
        print(json.dumps(scrape(json.load(sys.stdin)), allow_nan=False))
    except Exception as error:
        # Log only the exception class; don't echo request data or credentials.
        print(f"JobSpy worker failed: {type(error).__name__}", file=sys.stderr)
        sys.exit(1)
