from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parent
(root/'dist').mkdir(exist_ok=True)
with ZipFile(root/'dist/OmaAreena.wgt','w',ZIP_DEFLATED) as z:
 for f in sorted((root/'app').rglob('*')):
  if f.is_file():z.write(f,f.relative_to(root/'app'))
print(root/'dist/OmaAreena.wgt')
