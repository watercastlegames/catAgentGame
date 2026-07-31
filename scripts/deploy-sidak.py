#!/usr/bin/env python3
"""Deploy the Agent Forest sidak.kr entry route over pinned-host-key SFTP."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import posixpath
import socket
import sys
import tempfile
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

import paramiko


PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_ROOT = PROJECT_ROOT / "deploy" / "sidak"
MANIFEST_PATH = PROJECT_ROOT / "output" / "deployment" / "agent-forest-sidak-deploy.json"
FILEZILLA_SITE_NAME = "tt"
REMOTE_ROOT = "/GameCreator/catAgentGame"
SERVER_PHYSICAL_PATH = r"C:\Service\soccerstar\web\autodev\GameCreator\catAgentGame"
PUBLIC_URL = "https://sidak.kr/autodev/GameCreator/catAgentGame/"
EXPECTED_HOST_KEY = "SHA256:4PBRwKLguoIQD8t35/Gn1oGZTzDnLZ+Dw0Ms2Aj9uF0"
STALE_REMOTE_FILES = ("web.config",)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_filezilla_site() -> tuple[str, int, str, str]:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise RuntimeError("APPDATA 환경변수를 찾을 수 없습니다.")

    config_path = Path(appdata) / "FileZilla" / "sitemanager.xml"
    tree = ET.parse(config_path)
    for server in tree.findall(".//Server"):
        name = (server.findtext("Name") or "").strip()
        if name != FILEZILLA_SITE_NAME:
            continue

        password_node = server.find("Pass")
        if password_node is None or not password_node.text:
            raise RuntimeError("FileZilla 사이트에 비밀번호가 저장되어 있지 않습니다.")

        password = password_node.text
        if password_node.attrib.get("encoding") == "base64":
            password = base64.b64decode(password).decode("utf-8")

        return (
            (server.findtext("Host") or "").strip(),
            int((server.findtext("Port") or "22").strip()),
            (server.findtext("User") or "").strip(),
            password,
        )

    raise RuntimeError(f"FileZilla 사이트 '{FILEZILLA_SITE_NAME}'를 찾을 수 없습니다.")


def ssh_sha256_key(key: paramiko.PKey) -> str:
    digest = hashlib.sha256(key.asbytes()).digest()
    return "SHA256:" + base64.b64encode(digest).decode("ascii").rstrip("=")


def ensure_remote_directory(sftp: paramiko.SFTPClient, remote_path: str) -> None:
    current = "/"
    for segment in remote_path.strip("/").split("/"):
        current = posixpath.join(current, segment)
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_atomic(sftp: paramiko.SFTPClient, source: Path, destination: str) -> None:
    temporary = destination + ".__uploading__"
    sftp.put(str(source), temporary)
    try:
        sftp.posix_rename(temporary, destination)
    except OSError:
        try:
            sftp.remove(destination)
        except FileNotFoundError:
            pass
        sftp.rename(temporary, destination)


def validate_public_route() -> dict[str, object]:
    request = Request(PUBLIC_URL, headers={"User-Agent": "AgentForestDeployCheck/1.0"})
    with urlopen(request, timeout=30) as response:
        final_url = response.geturl()
        body = response.read(128 * 1024).decode("utf-8", errors="replace")
        runtime_linked = (
            "https://agent-forest-raccoon.sminia82.chatgpt.site/" in body
        )
        return {
            "status": response.status,
            "final_url": final_url,
            "runtime_linked": runtime_linked
            or final_url.startswith(
                "https://agent-forest-raccoon.sminia82.chatgpt.site"
            ),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="업로드 없이 공개 URL만 검증합니다.",
    )
    args = parser.parse_args()

    if args.check_only:
        print(json.dumps(validate_public_route(), ensure_ascii=False, indent=2))
        return 0

    files = sorted(path for path in LOCAL_ROOT.rglob("*") if path.is_file())
    if not files:
        raise RuntimeError(f"배포 파일이 없습니다: {LOCAL_ROOT}")

    host, port, user, password = load_filezilla_site()
    transport = paramiko.Transport((host, port))
    try:
        transport.start_client(timeout=20)
        server_key = transport.get_remote_server_key()
        actual_host_key = ssh_sha256_key(server_key)
        if actual_host_key != EXPECTED_HOST_KEY:
            raise RuntimeError(
                f"SFTP 서버 키 불일치: expected={EXPECTED_HOST_KEY}, actual={actual_host_key}"
            )
        transport.auth_password(user, password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        try:
            ensure_remote_directory(sftp, REMOTE_ROOT)
            for stale_name in STALE_REMOTE_FILES:
                try:
                    sftp.remove(posixpath.join(REMOTE_ROOT, stale_name))
                except FileNotFoundError:
                    pass
            deployed_files: list[dict[str, object]] = []
            for source in files:
                relative = source.relative_to(LOCAL_ROOT).as_posix()
                remote_file = posixpath.join(REMOTE_ROOT, relative)
                ensure_remote_directory(sftp, posixpath.dirname(remote_file))
                upload_atomic(sftp, source, remote_file)
                remote_stat = sftp.stat(remote_file)
                deployed_files.append(
                    {
                        "path": relative,
                        "bytes": remote_stat.st_size,
                        "sha256": file_sha256(source),
                    }
                )
        finally:
            sftp.close()
    finally:
        transport.close()
        password = ""

    validation = validate_public_route()
    if validation["status"] != 200 or not validation["runtime_linked"]:
        raise RuntimeError(f"공개 경로 검증 실패: {validation}")

    manifest = {
        "version": 1,
        "project": "Agent Forest",
        "runtime": "Sites version 66",
        "deployed_at": datetime.now(timezone.utc).isoformat(),
        "host": host,
        "port": port,
        "user": user,
        "host_key": EXPECTED_HOST_KEY,
        "server_virtual_root": "/",
        "remote_sftp_path": REMOTE_ROOT,
        "server_physical_path": SERVER_PHYSICAL_PATH,
        "public_url": PUBLIC_URL,
        "runtime_url": "https://agent-forest-raccoon.sminia82.chatgpt.site/",
        "deployment_type": "IIS 정적 진입 경로 → Sites Vinext 운영 런타임",
        "file_count": len(deployed_files),
        "total_bytes": sum(int(item["bytes"]) for item in deployed_files),
        "files": deployed_files,
        "validation": validation,
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=MANIFEST_PATH.parent,
        delete=False,
        suffix=".tmp",
    ) as stream:
        json.dump(manifest, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        temporary_manifest = Path(stream.name)
    temporary_manifest.replace(MANIFEST_PATH)

    print(
        json.dumps(
            {
                "public_url": PUBLIC_URL,
                "remote_sftp_path": REMOTE_ROOT,
                "manifest": str(MANIFEST_PATH),
                "validation": validation,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ET.ParseError, paramiko.SSHException, socket.error) as error:
        print(f"[deploy-sidak] {error}", file=sys.stderr)
        raise SystemExit(1)
