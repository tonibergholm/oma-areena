#!/usr/bin/env python3
"""Build, sign and install on a developer-enabled Samsung TV."""
import argparse
import os
import pathlib
import shlex
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tv', default=os.environ.get('TV_IP'), help='TV IP address (or TV_IP)')
parser.add_argument('--cli', default=os.environ.get('TIZEN_SDB_COMMAND', 'TizenSdb'), help='TizenSdb command, e.g. "dotnet /path/to/TizenSdb.dll"')
parser.add_argument('--cert-dir', default=os.environ.get('TIZEN_CERT_DIR'), help='Directory containing author.p12, distributor.p12 and password.txt')
parser.add_argument('--sdk-path', default='/home/owner/share/tmp/sdk_tools', help='TV sdk_toolpath capability value')
args = parser.parse_args()
if not args.tv or not args.cert_dir:
    parser.error('--tv and --cert-dir are required (or TV_IP and TIZEN_CERT_DIR)')
cli = shlex.split(args.cli)
certs = pathlib.Path(args.cert_dir).expanduser()
password = (certs / 'password.txt').read_text().strip()
subprocess.run([sys.executable, str(root / 'build.py')], check=True)
subprocess.run(cli + ['resign', str(root / 'dist/OmaAreena.wgt'), str(certs / 'author.p12'), str(certs / 'distributor.p12'), password], check=True)
result = subprocess.run(cli + ['install', args.tv, str(root / 'dist/OmaAreena.wgt'), args.sdk_path], capture_output=True, text=True, check=True)
print(result.stdout)
if 'install completed' not in result.stdout:
    raise RuntimeError('TV did not confirm installation: ' + result.stderr)
