@echo off
REM Re-bake all 108 voice lines using the verbatim prompt + transcript capture.
REM Streams progress to the terminal AND to scripts\bake.log so you can also
REM tail the log from another window.
REM Usage:    scripts\rebake.cmd
REM Optional: scripts\rebake.cmd --night 1 --voice halberd
REM
REM Requires OPENROUTER_API_KEY in the environment, or set it on the next line.
set OPENROUTER_API_KEY=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

pushd "%~dp0\.."
echo [%DATE% %TIME%] starting bake (this will take ~5-10 minutes for the full 108 lines)
echo Output is also being written to scripts\bake.log
echo.

REM 2>&1 merges stderr into stdout, then powershell Tee-Object splits it to
REM both the console and the log file in real time. Each baked line prints a
REM single "ok  : ..." or "FAIL: ..." row so you can watch progress live.
REM Incremental by default — only bakes missing files. To re-bake everything,
REM run:  scripts\rebake.cmd --force --whisper
node scripts\generate-voices.js --whisper %* 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath scripts\bake.log"

echo.
echo [%DATE% %TIME%] bake finished.  Done.
popd
