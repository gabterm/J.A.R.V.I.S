import re
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class Headphones:
    name: str
    address: str
    connected: bool
    battery: Optional[int]
    is_microphone_available: bool


def get_bluetooth_info() -> str:
    result = subprocess.run(
        ["/usr/sbin/system_profiler", "SPBluetoothDataType"],
        capture_output=True,
        text=True,
        check=True,
    )

    return result.stdout


def get_current_headphones() -> Optional[Headphones]:
    output = get_bluetooth_info()

    in_connected_section = False
    device_name = None
    device_info = []

    for line in output.splitlines():
        stripped = line.strip()

        if stripped == "Connected:":
            in_connected_section = True
            continue

        if stripped == "Not Connected:":
            break

        if not in_connected_section:
            continue

        device_match = re.match(
            r"^\s{8}([^:\n]+):\s*$",
            line,
        )

        if device_match:
            device_name = device_match.group(1).strip()
            continue

        if device_name:
            device_info.append(stripped)

    if not device_name:
        return None

    address = None
    services = ""

    for info in device_info:
        address_match = re.match(
            r"Address:\s*(.+)",
            info,
        )

        if address_match:
            address = address_match.group(1)

        services_match = re.match(
            r"Services:.*<\s*(.*?)\s*>",
            info,
        )

        if services_match:
            services = services_match.group(1)

    if not address:
        return None

    services = services.split()

    return Headphones(
        name=device_name,
        address=address,
        connected=True,
        battery=None,
        is_microphone_available="HFP" in services,
    )


headphones = get_current_headphones()

if headphones:
    print("Nome:", headphones.name)
    print("Endereço:", headphones.address)
    print("Conectado:", headphones.connected)
    print("Bateria:", headphones.battery)
    print("Microfone:", headphones.is_microphone_available)
else:
    print("Nenhum fone Bluetooth conectado.")