import json
import os
import queue
import shutil
import threading
import time
import uuid
from pathlib import Path

import obspython as obs

CONTROL = "Cricket Super Movements Control"
PLAYLIST = "Cricket Match Highlights VLC"
MEDIA_EXTENSIONS = {".mp4", ".mkv", ".mov", ".flv", ".ts", ".webm"}
results = queue.Queue()
loaded = False
playlist_signature = None


def script_description():
    return "Copies selected Super Movements replays without changing playback speed and refreshes the Match Highlights VLC playlist. Enable the flags and run Cricket Match Setup in the app."


def read_control():
    source = obs.obs_get_source_by_name(CONTROL)
    if not source:
        return None
    settings = obs.obs_source_get_settings(source)
    try:
        return json.loads(obs.obs_data_get_string(settings, "text") or "{}")
    finally:
        obs.obs_data_release(settings)
        obs.obs_source_release(source)


def write_control(control):
    source = obs.obs_get_source_by_name(CONTROL)
    if not source:
        return
    settings = obs.obs_data_create()
    try:
        obs.obs_data_set_string(settings, "text", json.dumps(control))
        obs.obs_source_update(source, settings)
    finally:
        obs.obs_data_release(settings)
        obs.obs_source_release(source)


def refresh_playlist(folder):
    global playlist_signature
    if not folder.is_dir():
        return
    files = sorted((path for path in folder.iterdir() if path.is_file() and path.suffix.lower() in MEDIA_EXTENSIONS), key=lambda path: path.name)
    signature = tuple(str(path) for path in files)
    if signature == playlist_signature:
        return
    source = obs.obs_get_source_by_name(PLAYLIST)
    if not source:
        return
    settings = obs.obs_data_create()
    playlist = obs.obs_data_array_create()
    try:
        for path in files:
            entry = obs.obs_data_create()
            obs.obs_data_set_string(entry, "value", str(path))
            obs.obs_data_array_push_back(playlist, entry)
            obs.obs_data_release(entry)
        obs.obs_data_set_array(settings, "playlist", playlist)
        obs.obs_data_set_bool(settings, "loop", False)
        obs.obs_data_set_bool(settings, "shuffle", False)
        obs.obs_source_update(source, settings)
        playlist_signature = signature
    finally:
        obs.obs_data_array_release(playlist)
        obs.obs_data_release(settings)
        obs.obs_source_release(source)


def copy_clip(saved_path, request_id):
    partial = None
    try:
        request_id = str(uuid.UUID(request_id))
        source = Path(saved_path).resolve(strict=True)
        if source.suffix.lower() not in MEDIA_EXTENSIONS:
            raise ValueError("Unsupported replay file format")
        folder = source.parent.parent / "Super Movements"
        folder.mkdir(parents=True, exist_ok=True)
        destination = folder / (source.stem + "-" + request_id + source.suffix)
        partial = destination.with_suffix(destination.suffix + ".partial")
        shutil.copy2(source, partial)
        os.replace(partial, destination)
        results.put({"requestId": request_id, "status": "saved", "savedPath": str(destination), "error": ""})
    except Exception as error:
        try:
            if partial:
                partial.unlink(missing_ok=True)
        except OSError:
            pass
        results.put({"requestId": request_id, "status": "error", "error": str(error)})


def frontend_event(event):
    if event != obs.OBS_FRONTEND_EVENT_REPLAY_BUFFER_SAVED:
        return
    control = read_control()
    if not control or not control.get("saveEnabled") or control.get("status") != "armed":
        return
    if abs(time.time() * 1000 - control.get("armedAt", 0)) > 60000:
        return
    output = obs.obs_frontend_get_replay_buffer_output()
    if not output:
        return
    calldata = obs.calldata_create()
    try:
        obs.proc_handler_call(obs.obs_output_get_proc_handler(output), "get_last_replay", calldata)
        saved_path = obs.calldata_string(calldata, "path")
    finally:
        obs.calldata_destroy(calldata)
        obs.obs_output_release(output)
    if not saved_path:
        control.update(status="error", error="OBS did not provide the saved replay path")
        write_control(control)
        return
    control["status"] = "copying"
    write_control(control)
    threading.Thread(target=copy_clip, args=(saved_path, control["requestId"]), daemon=True).start()


def tick():
    if not loaded:
        return
    try:
        control = read_control()
        if control is None:
            return
        while not results.empty():
            result = results.get_nowait()
            if result["requestId"] == control.get("requestId"):
                control.update(result)
        control["readyAt"] = int(time.time() * 1000)
        write_control(control)
        if control.get("highlightsEnabled") and control.get("replayDirectory"):
            refresh_playlist(Path(control["replayDirectory"]).parent / "Super Movements")
    except Exception as error:
        obs.script_log(obs.LOG_WARNING, "Super Movements: " + str(error))


def script_load(settings):
    global loaded, playlist_signature
    loaded = True
    playlist_signature = None
    obs.obs_frontend_add_event_callback(frontend_event)
    obs.timer_add(tick, 1000)


def script_unload():
    global loaded
    loaded = False
    obs.timer_remove(tick)
    obs.obs_frontend_remove_event_callback(frontend_event)