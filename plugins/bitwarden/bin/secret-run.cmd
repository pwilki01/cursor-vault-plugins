@echo off
set PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs
node "%~dp0..\dist\secret-run.mjs" %*
