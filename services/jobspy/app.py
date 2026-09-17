"""Private, bounded HTTP adapter for RemoteJobs44's existing JobSpy client."""
import asyncio
import json
import os
from pathlib import Path
import secrets
import sys
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query

ALLOWED_SITES = {"indeed", "linkedin", "zip_recruiter", "google", "bayt", "naukri"}
DEFAULT_SITES = "indeed,linkedin,zip_recruiter,google"
WORKER = Path(__file__).with_name("worker.py")
SEARCH_TIMEOUT = 22  # Below the Next.js client's 25-second attempt timeout.


@asynccontextmanager
async def lifespan(app):
    key = os.environ.get("JOBSPY_API_KEY", "").strip()
    if len(key) < 32 or not key.isascii():
        raise RuntimeError("JOBSPY_API_KEY must contain at least 32 ASCII characters")
    app.state.api_key = key
    app.state.search_lock = asyncio.Lock()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


async def authenticate(x_api_key: Annotated[str | None, Header()] = None):
    supplied = (x_api_key or "").encode("utf-8")
    if not secrets.compare_digest(supplied, app.state.api_key.encode("ascii")):
        raise HTTPException(401, "Invalid API key")


@app.get("/healthz")
async def health():
    return {"status": "ok"}


async def run_search(options):
    # A child process, rather than a timed-out thread, lets us actually stop
    # scraper sockets/work on timeout. No key or request headers enter the child.
    env = {k: v for k, v in os.environ.items() if k != "JOBSPY_API_KEY"}
    process = await asyncio.create_subprocess_exec(
        sys.executable, str(WORKER), stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=None, env=env,
    )
    try:
        output, _ = await asyncio.wait_for(
            process.communicate(json.dumps(options).encode()), SEARCH_TIMEOUT,
        )
        if process.returncode:
            raise HTTPException(502, "Job board search failed; check service logs")
        result = json.loads(output)
        if not isinstance(result, dict) or not isinstance(result.get("jobs"), list):
            raise ValueError("Invalid worker response")
        return result
    except TimeoutError:
        raise HTTPException(504, "Job board search exceeded time limit") from None
    except (ValueError, UnicodeError):
        raise HTTPException(502, "Invalid scraper response") from None
    finally:
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            await process.communicate()


@app.get("/api/v1/search_jobs", dependencies=[Depends(authenticate)])
async def search(
    search_term: Annotated[str, Query(min_length=1, max_length=200)],
    site_name: Annotated[str, Query(max_length=100)] = DEFAULT_SITES,
    location: Annotated[str | None, Query(max_length=200)] = None,
    results_wanted: Annotated[int, Query(ge=1, le=200)] = 40,
    hours_old: Annotated[int | None, Query(ge=1, le=720)] = None,
    is_remote: bool = True,
    job_type: Literal["fulltime", "parttime", "internship", "contract"] | None = None,
    country_indeed: Annotated[str, Query(min_length=2, max_length=64)] = "usa",
    format: Literal["json"] = "json",
):
    sites = list(dict.fromkeys(s.strip().lower() for s in site_name.split(",")))
    if not search_term.strip() or not sites or any(s not in ALLOWED_SITES for s in sites):
        raise HTTPException(422, "Provide a search term and supported sites")
    if app.state.search_lock.locked():
        raise HTTPException(429, "Another search is running", headers={"Retry-After": "5"})
    async with app.state.search_lock:
        return await run_search({
            "site_name": sites, "search_term": search_term.strip(),
            "google_search_term": f"{search_term.strip()} jobs" + (f" near {location}" if location else ""),
            "location": location, "results_wanted": results_wanted,
            "hours_old": hours_old, "is_remote": is_remote, "job_type": job_type,
            "country_indeed": country_indeed.lower(),
        })
