@echo off
REM ============================================================================
REM Hotel Cascadia — one-shot redesign rebake.
REM
REM What it does, in order:
REM   1. Dry-run the parser against games/switchboard/content.js to make sure
REM      every voice / room / ending line is picked up before we touch the
REM      assets folder. Aborts on parse error so we don't wipe a working bake.
REM   2. Backs up the current assets/switchboard/voices folder to
REM      assets/switchboard/voices_pre_cascadia/ in case you want to roll back.
REM   3. Wipes the live voices folder (the 418 Linden cast is fully retired).
REM   4. Bakes the new Hotel Cascadia cast (~120 lines: 4 nights of calls +
REM      whisper variants for dead-line bleed-through + 5 walkthrough rooms +
REM      3 endings). Streams progress to scripts\bake.log.
REM
REM Run from the repo root:
REM     scripts\rebake-cascadia.cmd
REM
REM Optional flags pass through to generate-voices.js, e.g.:
REM     scripts\rebake-cascadia.cmd --night 1
REM     scripts\rebake-cascadia.cmd --voice architect
REM
REM Requires OPENROUTER_API_KEY in the environment, or set it on the next line.
REM ============================================================================

REM Always overwrite with the working key — the previous one was rotated.
set OPENROUTER_API_KEY=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

pushd "%~dp0\.."

echo.
echo ============================================================
echo  HOTEL CASCADIA - one-shot rebake
echo ============================================================
echo.

REM --- Step 1: dry-run parser sanity check -----------------------------------
echo [%TIME%] Step 1/4 - parsing games/switchboard/content.js (dry run)...
node scripts\generate-voices.js --dry --whisper > scripts\bake.dryrun.log 2>&1
if errorlevel 1 (
  echo.
  echo PARSE FAILED. Aborting before any files are touched. See scripts\bake.dryrun.log
  popd
  exit /b 1
)

REM Pull the "Parsed N total lines" line for a quick sanity check.
for /f "tokens=*" %%L in ('findstr /B /C:"Parsed " scripts\bake.dryrun.log') do echo   %%L
echo   (full line list in scripts\bake.dryrun.log)
echo.

REM --- Step 2: back up the old voices folder ---------------------------------
REM Only back up the FIRST time we see content in voices/. On retry runs (e.g.
REM after an API key failure) the live folder may already be empty from the
REM previous wipe, and we MUST NOT clobber the real backup with that empty
REM state. So: skip if voices_pre_cascadia/ already exists.
if exist "assets\switchboard\voices_pre_cascadia" (
  echo [%TIME%] Step 2/4 - backup already exists at assets\switchboard\voices_pre_cascadia\, leaving it alone.
) else if exist "assets\switchboard\voices" (
  echo [%TIME%] Step 2/4 - backing up assets\switchboard\voices to assets\switchboard\voices_pre_cascadia\
  REM /E recurse, /I assume dest is dir, /Y overwrite, /Q quiet
  xcopy "assets\switchboard\voices" "assets\switchboard\voices_pre_cascadia\" /E /I /Y /Q > nul
  echo   Backup complete.
) else (
  echo [%TIME%] Step 2/4 - no existing voices folder, skipping backup.
)
echo.

REM --- Step 3: wipe the live voices folder -----------------------------------
echo [%TIME%] Step 3/4 - clearing assets\switchboard\voices\ (all .wav .mp3 .txt)
if exist "assets\switchboard\voices" (
  del /F /Q "assets\switchboard\voices\*.wav" 2>nul
  del /F /Q "assets\switchboard\voices\*.mp3" 2>nul
  del /F /Q "assets\switchboard\voices\*.txt" 2>nul
)
echo.

REM --- Step 4: bake new Hotel Cascadia cast ----------------------------------
echo [%TIME%] Step 4/4 - baking Hotel Cascadia cast.
echo   Expect 6-12 minutes for the full set. Progress streams below and to scripts\bake.log
echo.
node scripts\generate-voices.js --force --whisper %* 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath scripts\bake.log"

echo.
echo ============================================================
echo  [%TIME%] Cascadia rebake finished.
echo  - Backup of the old cast: assets\switchboard\voices_pre_cascadia\
echo  - New cast:               assets\switchboard\voices\
echo  - Bake transcript:        scripts\bake.log
echo.
echo  Open index.html (or your usual dev server) and select Hotel
echo  Cascadia from the lobby to play.
echo ============================================================
popd
