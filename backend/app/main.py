# TODO(jane): PLACEHOLDER for step-1 Docker learning.
# This file will be replaced by B's real FastAPI app entrypoint.
# Safe to overwrite. Do not extend this file beyond the minimal hello-world.

from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {"hello": "online-code-test backend"}
