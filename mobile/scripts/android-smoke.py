#!/usr/bin/env python3
"""Dependency-free Android UI smoke test for the demo/QA APK.

Uses only adb and Android's bundled UIAutomator. Artifacts are intentionally
written outside the source tree so CI can upload them even after a failure.
"""

import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = os.environ.get("ANDROID_SMOKE_PACKAGE", "com.remotejobs44.app.qa")
APK = os.environ.get("ANDROID_SMOKE_APK", "android/app/build/outputs/apk/release/app-release.apk")
ARTIFACTS = Path(os.environ.get("ANDROID_SMOKE_ARTIFACTS", "../android-smoke-artifacts"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
step_number = 0


def adb(*args: str, check: bool = True, capture: bool = True) -> str:
    try:
        result = subprocess.run(
            ["adb", *args], text=True, stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.STDOUT if capture else None, timeout=60,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"adb {' '.join(args)} timed out after 60s") from exc
    if check and result.returncode:
        raise RuntimeError(f"adb {' '.join(args)} failed:\n{result.stdout}")
    return result.stdout or ""


def hierarchy() -> ET.Element:
    adb("shell", "uiautomator", "dump", "/sdcard/window.xml")
    xml = adb("shell", "cat", "/sdcard/window.xml")
    (ARTIFACTS / "last-window.xml").write_text(xml, encoding="utf-8")
    return ET.fromstring(xml)


def value(node: ET.Element) -> str:
    return node.attrib.get("content-desc") or node.attrib.get("text") or ""


def nodes_matching(label: str, contains: bool = False) -> list[ET.Element]:
    nodes = []
    for node in hierarchy().iter("node"):
        candidate = value(node)
        if (label in candidate) if contains else (candidate == label):
            nodes.append(node)
    return nodes


def wait_for(label: str, contains: bool = False, timeout: int = 30) -> list[ET.Element]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        found = nodes_matching(label, contains)
        if found:
            return found
        assert_healthy()
        time.sleep(1)
    raise AssertionError(f"Timed out waiting for {'text containing' if contains else 'text'} {label!r}")


def center(node: ET.Element) -> tuple[int, int]:
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib["bounds"])
    if not match:
        raise AssertionError(f"Missing bounds on {value(node)!r}")
    x1, y1, x2, y2 = map(int, match.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2


def tap(label: str, *, contains: bool = False, last: bool = False) -> None:
    found = wait_for(label, contains)
    node = found[-1] if last else found[0]
    x, y = center(node)
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(1)
    assert_healthy()


def screenshot(name: str) -> None:
    global step_number
    step_number += 1
    target = ARTIFACTS / f"{step_number:02d}-{name}.png"
    with target.open("wb") as output:
        try:
            result = subprocess.run(
                ["adb", "exec-out", "screencap", "-p"], stdout=output, timeout=60,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Could not capture {target}: adb timed out after 60s") from exc
    if result.returncode:
        raise RuntimeError(f"Could not capture {target}")


def logcat() -> str:
    output = adb("logcat", "-d", "-v", "threadtime", check=False)
    (ARTIFACTS / "logcat.txt").write_text(output, encoding="utf-8")
    return output


def assert_healthy() -> None:
    activities = adb("shell", "dumpsys", "activity", "activities", check=False)
    windows = adb("shell", "dumpsys", "window", "windows", check=False)
    focus_markers = (
        "topResumedActivity",
        "mResumedActivity",
        "ResumedActivity",
        "mCurrentFocus",
        "mFocusedApp",
    )
    focus_lines = [
        line.strip()
        for line in (activities + "\n" + windows).splitlines()
        if any(marker in line for marker in focus_markers)
    ]
    (ARTIFACTS / "foreground.txt").write_text(
        "\n".join(focus_lines) + "\n", encoding="utf-8",
    )
    if not any(PACKAGE in line for line in focus_lines):
        observed = "\n".join(focus_lines) or "No focus markers returned by dumpsys"
        raise AssertionError(f"{PACKAGE} is no longer foreground:\n{observed}")
    output = logcat()
    crashes = re.findall(
        r"FATAL EXCEPTION[\s\S]{0,1200}?Process: " + re.escape(PACKAGE) + r"[^\n]*"
        r"|Fatal signal[^\n]*(?:\(" + re.escape(PACKAGE) + r"\)|" + re.escape(PACKAGE) + r")",
        output,
    )
    crashes += re.findall(r"ReactNativeJS[^\n]*(?:Unhandled JS Exception|Error:)", output)
    crashes += re.findall(r"ANR in " + re.escape(PACKAGE) + r"[^\n]*", output)
    if crashes:
        raise AssertionError("Native crash detected:\n" + "\n".join(crashes[-8:]))


def clear_app_data() -> None:
    adb("shell", "am", "force-stop", PACKAGE, check=False)
    adb("shell", "pm", "clear", PACKAGE)


def cold_launch_deep_link(uri: str) -> None:
    adb("shell", "am", "force-stop", PACKAGE, check=False)
    output = adb(
        "shell", "am", "start", "-W",
        "-a", "android.intent.action.VIEW",
        "-d", uri,
        "-p", PACKAGE,
    )
    if "Error:" in output or "unable to resolve Intent" in output:
        raise AssertionError(f"Could not cold-launch app deep link {uri!r}:\n{output}")
    time.sleep(2)
    assert_healthy()


def main() -> None:
    try:
        adb("wait-for-device")
        adb("install", "-r", APK)
        adb("logcat", "-c")

        # Exercise callback failures from a fully stopped process before the
        # regular demo journey. These links contain no authorization code,
        # session token, or payment reference, so they cannot touch a real
        # account or charge even if a CI environment is configured.
        clear_app_data()
        cold_launch_deep_link("remotejobs44://auth-callback?error=access_denied")
        wait_for("Sign-in failed")
        wait_for("Social sign-in was cancelled or denied. Please try again.")
        screenshot("auth-callback-denied")

        clear_app_data()
        cold_launch_deep_link("remotejobs44://auth-callback")
        wait_for("Sign-in failed")
        wait_for("The sign-in callback is missing. Return to sign in and try again.")
        screenshot("auth-callback-missing")

        clear_app_data()
        cold_launch_deep_link("remotejobs44://paystack-return")
        wait_for("Payment status")
        wait_for("There is no payment from this account waiting to be verified.")
        screenshot("payment-return-missing")

        clear_app_data()
        adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
        time.sleep(2)

        wait_for("70,000+ remote jobs")
        screenshot("onboarding")
        tap("Next")
        wait_for("Matches that fit you")
        tap("Next")
        wait_for("Never miss a role")
        tap("Get started")

        wait_for("The world's remote jobs,", contains=True)
        screenshot("sign-in")
        # The QA APK deliberately has no backend environment, so this exercises
        # the sign-in affordance and enters the app's built-in demo session.
        tap("Sign in", last=True)
        wait_for("Home")
        screenshot("feed")

        tap("Search")
        wait_for("Search remote jobs…")
        tap("Search remote jobs…")
        adb("shell", "input", "text", "Engineer")
        adb("shell", "input", "keyevent", "KEYCODE_ENTER")
        time.sleep(2)
        screenshot("jobs-search")

        cards = [n for n in hierarchy().iter("node") if re.search(r"^.+ at .+, .+, .+$", value(n))]
        engineer_cards = [n for n in cards if "Engineer at " in value(n)]
        if not engineer_cards:
            raise AssertionError("Engineer search produced no Engineer job card")
        if any(value(n).startswith("Product Designer at ") for n in cards):
            raise AssertionError("Engineer search still displayed the Product Designer job card")
        selected_card = value(engineer_cards[0])
        selected_job = selected_card.split(" at ", 1)[0]
        x, y = center(engineer_cards[0])
        adb("shell", "input", "tap", str(x), str(y))
        wait_for(selected_job)
        screenshot("job-detail")
        tap("Save")

        tap("Back")
        wait_for("Search")
        tap("Saved")
        # Demo state begins with Backend Engineer saved. Saving the selected
        # Frontend Engineer must add a second distinct card, not just update a
        # counter or navigate successfully.
        wait_for("2 jobs saved")
        wait_for(selected_card)
        screenshot("saved")
        tap("Profile")
        wait_for("Profile strength")
        screenshot("profile")
        assert_healthy()
        print(
            "Android smoke journey passed: callback failures, safe payment return, "
            "onboarding, demo sign-in, feed, search, detail, saved, profile"
        )
    except Exception as exc:
        try:
            screenshot("failure")
            logcat()
            hierarchy()
        except Exception:
            pass
        print(f"ANDROID SMOKE FAILED: {exc}", file=sys.stderr)
        return 1
    finally:
        # Evidence collection must never replace the original test failure.
        try:
            logcat()
        except Exception as exc:
            print(f"Could not collect final logcat: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
