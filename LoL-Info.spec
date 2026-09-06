# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build.

--onedir (COLLECT), not --onefile. A onefile build self-extracts the whole
bundle to a temp directory on every launch before Python starts, and Defender
then scans the freshly written files; that alone cost the old build 0.5-2s per
start. A onedir build maps the files in place.

UPX is disabled: compressing Qt's DLLs adds decompression time to every launch
and is a known source of corrupted Qt binaries.
"""

# Qt modules the app never touches. PySide6's PyInstaller hook pulls in a great
# deal by default; excluding these cuts both bundle size and DLL load time.
EXCLUDES = [
    "PySide6.QtQml", "PySide6.QtQuick", "PySide6.QtQuickWidgets",
    "PySide6.QtQuick3D", "PySide6.Qt3DCore", "PySide6.Qt3DRender",
    "PySide6.QtWebEngineCore", "PySide6.QtWebEngineWidgets", "PySide6.QtWebChannel",
    "PySide6.QtMultimedia", "PySide6.QtMultimediaWidgets",
    "PySide6.QtCharts", "PySide6.QtDataVisualization",
    "PySide6.QtBluetooth", "PySide6.QtNfc", "PySide6.QtPositioning",
    "PySide6.QtSql", "PySide6.QtTest", "PySide6.QtDesigner", "PySide6.QtHelp",
    "PySide6.QtOpenGL", "PySide6.QtOpenGLWidgets", "PySide6.QtPdf",
    "PySide6.QtSerialPort", "PySide6.QtSensors", "PySide6.QtSpatialAudio",
    "PySide6.QtTextToSpeech", "PySide6.QtUiTools", "PySide6.QtSvgWidgets",
    # Unused stdlib weight
    "tkinter", "unittest", "pydoc", "doctest", "test", "distutils",
    "email", "html", "http", "xmlrpc", "pdb", "sqlite3",
]

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    # .env is deliberately NOT bundled: it holds the API key and is read from
    # beside the .exe at runtime. Copy it next to the executable after building.
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=EXCLUDES,
    noarchive=False,
    optimize=1,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="LoL-Info",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=["app_icon.ico"],
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="LoL-Info",
)
