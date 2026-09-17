import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx
import pandas as pd

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import app  # noqa: E402
import worker  # noqa: E402


KEY = "a" * 40


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def request(self, path, *, headers=None):
        async with app.app.router.lifespan_context(app.app):
            transport = httpx.ASGITransport(app=app.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.get(path, headers=headers)

    async def test_startup_rejects_missing_or_short_key(self):
        with patch.dict(os.environ, {"JOBSPY_API_KEY": ""}, clear=False):
            with self.assertRaisesRegex(RuntimeError, "at least 32 ASCII"):
                async with app.app.router.lifespan_context(app.app):
                    pass

    async def test_authentication_rejects_wrong_key(self):
        with patch.dict(os.environ, {"JOBSPY_API_KEY": KEY}, clear=False):
            response = await self.request("/api/v1/search_jobs?search_term=python",
                                          headers={"x-api-key": "b" * 40})
        self.assertEqual(response.status_code, 401)

    async def test_valid_request_maps_and_bounds_options(self):
        result = {"jobs": [{"job_url": "https://jobs.example/1"}]}
        fake_search = AsyncMock(return_value=result)
        with patch.dict(os.environ, {"JOBSPY_API_KEY": KEY}, clear=False), \
             patch.object(app, "run_search", fake_search):
            response = await self.request(
                "/api/v1/search_jobs?search_term=%20remote%20python%20&site_name=Indeed,linkedin,indeed"
                "&location=US&results_wanted=7&hours_old=24&is_remote=false&job_type=contract"
                "&country_indeed=GB", headers={"x-api-key": KEY})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        fake_search.assert_awaited_once_with({
            "site_name": ["indeed", "linkedin"],
            "search_term": "remote python",
            "google_search_term": "remote python jobs near US",
            "location": "US",
            "results_wanted": 7,
            "hours_old": 24,
            "is_remote": False,
            "job_type": "contract",
            "country_indeed": "gb",
        })

    async def test_invalid_sites_and_ranges_are_rejected(self):
        cases = [
            "/api/v1/search_jobs?search_term=x&site_name=glassdoor",
            "/api/v1/search_jobs?search_term=x&results_wanted=0",
            "/api/v1/search_jobs?search_term=x&results_wanted=201",
            "/api/v1/search_jobs?search_term=x&hours_old=721",
            "/api/v1/search_jobs?search_term=x&job_type=hourly",
        ]
        with patch.dict(os.environ, {"JOBSPY_API_KEY": KEY}, clear=False):
            for path in cases:
                response = await self.request(path, headers={"x-api-key": KEY})
                self.assertEqual(response.status_code, 422, path)

    async def test_busy_search_returns_retryable_429(self):
        with patch.dict(os.environ, {"JOBSPY_API_KEY": KEY}, clear=False):
            async with app.app.router.lifespan_context(app.app):
                await app.app.state.search_lock.acquire()
                try:
                    transport = httpx.ASGITransport(app=app.app)
                    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                        response = await client.get(
                            "/api/v1/search_jobs?search_term=x", headers={"x-api-key": KEY})
                finally:
                    app.app.state.search_lock.release()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "5")

    async def test_subprocess_timeout_is_killed(self):
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / "sleep_worker.py"
            pid_file = Path(directory) / "pid"
            script.write_text(
                "import os,time\n"
                f"open({str(pid_file)!r}, 'w').write(str(os.getpid()))\n"
                "while True: time.sleep(1)\n"
            )
            with patch.object(app, "WORKER", script), patch.object(app, "SEARCH_TIMEOUT", 0.05):
                with self.assertRaises(app.HTTPException) as caught:
                    await app.run_search({"site_name": ["indeed"], "search_term": "x"})
            self.assertEqual(caught.exception.status_code, 504)
            pid = int(pid_file.read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    async def test_subprocess_protocol_success_and_failures(self):
        cases = [
            ('print(\'{"jobs": []}\')', None),
            ('raise SystemExit(1)', 502),
            ('print("invalid json")', 502),
            ('print(\'{"error": "upstream failed"}\')', 502),
        ]
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / "fixture.py"
            for source, status in cases:
                script.write_text(source)
                with patch.object(app, "WORKER", script):
                    if status is None:
                        self.assertEqual(await app.run_search({}), {"jobs": []})
                    else:
                        with self.assertRaises(app.HTTPException) as caught:
                            await app.run_search({})
                        self.assertEqual(caught.exception.status_code, status)

    async def test_health_public_but_search_requires_key(self):
        with patch.dict(os.environ, {"JOBSPY_API_KEY": KEY}, clear=False):
            self.assertEqual((await self.request('/healthz', headers={})).status_code, 200)
            self.assertEqual((await self.request('/api/v1/search_jobs?search_term=x', headers={})).status_code, 401)


class WorkerTests(unittest.TestCase):
    def fake_jobspy(self, scrape):
        module = type(sys)("jobspy")
        module.scrape_jobs = scrape
        return patch.dict(sys.modules, {"jobspy": module})

    def test_remote_filter_dates_and_json_nulls(self):
        now = datetime.now(timezone.utc).replace(microsecond=0)
        frame = pd.DataFrame([
            {"title": "keep", "is_remote": True, "date_posted": now,
             "min_amount": float("nan")},
            {"title": "local", "is_remote": False, "date_posted": now},
            {"title": "old", "is_remote": True,
             "date_posted": now - timedelta(days=10)},
        ])
        fake = lambda **kwargs: frame
        options = {"site_name": ["linkedin"], "search_term": "remote", "is_remote": True,
                   "hours_old": 24, "job_type": None}
        with self.fake_jobspy(fake):
            result = worker.scrape(options)
        self.assertEqual([row["title"] for row in result["jobs"]], ["keep"])
        self.assertIsNone(result["jobs"][0]["min_amount"])
        self.assertEqual(result["jobs"][0]["date_posted"], now.isoformat(timespec="milliseconds").replace("+00:00", "Z"))

    def test_indeed_incompatible_hours_old_is_removed_and_arguments_added(self):
        seen = {}
        frame = pd.DataFrame([{"title": "x", "is_remote": True}])

        def fake(**kwargs):
            seen.update(kwargs)
            return frame

        options = {"site_name": ["indeed", "linkedin"], "search_term": "x", "is_remote": True,
                   "hours_old": 48, "job_type": "contract"}
        with self.fake_jobspy(fake):
            worker.scrape(options)
        self.assertIsNone(seen["hours_old"])
        self.assertEqual(seen["description_format"], "html")
        self.assertTrue(seen["enforce_annual_salary"])
        self.assertEqual(seen["verbose"], 0)

    def test_scraper_error_log_raises_and_handler_is_removed(self):
        frame = pd.DataFrame([{"title": "x", "is_remote": True}])

        def fake(**kwargs):
            logging = __import__("logging")
            logging.getLogger("JobSpy").error("upstream failed")
            return frame

        options = {"site_name": ["linkedin"], "search_term": "x", "is_remote": False,
                   "hours_old": None, "job_type": None}
        with self.fake_jobspy(fake):
            with self.assertRaisesRegex(RuntimeError, "scraper error"):
                worker.scrape(options)
        self.assertFalse(any(isinstance(h, worker.ScraperErrors)
                             for h in __import__("logging").getLogger("JobSpy").handlers))

    def test_remote_filter_without_column_returns_empty(self):
        options = {"site_name": ["linkedin"], "search_term": "x", "is_remote": True,
                   "hours_old": None, "job_type": None}
        with self.fake_jobspy(lambda **kwargs: pd.DataFrame([{"title": "x"}])):
            self.assertEqual(worker.scrape(options), {"jobs": []})


if __name__ == "__main__":
    unittest.main()
