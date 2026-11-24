# Google Takeout export pipeline

Builds `assets/data/google/overview.json` from a local Google Takeout folder
(YouTube watch/search history, Access Log Activity, Devices, Timeline settings,
and Google Account subscriber/change history), stripping all PII before writing.

```sh
python3 _tools/google-demo/build_data.py --src /path/to/Takeout
python3 _tools/google-demo/verify.py
node _tools/google-demo/verify-browser.cjs
```
