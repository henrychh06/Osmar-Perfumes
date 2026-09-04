#!/usr/bin/env python3
"""Genera la carpeta docs/ que publica GitHub Pages.

Los archivos de la raíz (*.dc.html) son la fuente de verdad y se editan tal
cual; este script los transforma en el sitio publicado con direcciones limpias:

    Maros Landing.dc.html  ->  docs/index.html          marosparfums.com/
    Catalogo.dc.html       ->  docs/catalogo/index.html marosparfums.com/catalogo/
    Admin.dc.html          ->  docs/admin/index.html    marosparfums.com/admin/  (noindex)

Como cada página queda a distinta profundidad, hay que reescribir los enlaces
internos y las rutas de los recursos. Se usan rutas relativas (no absolutas)
para que el sitio siga funcionando también si se sirve desde una subcarpeta,
como la dirección de respaldo henrychh06.github.io/Osmar-Perfumes/.

Uso:  python3 publish.py
"""

import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(ROOT, "docs")

# origen -> (carpeta de destino, profundidad)
# La profundidad define cuántos "../" necesitan los recursos compartidos.
PAGES = [
    ("Maros Landing.dc.html", "", 0),
    ("Catalogo.dc.html", "catalogo", 1),
    ("Decants.dc.html", "decants", 1),
    ("Packs.dc.html", "packs", 1),
    ("Combo.dc.html", "combo", 1),
    ("Contacto.dc.html", "contacto", 1),
]

# Cómo se enlaza cada página desde el sitio publicado.
LINKS = {
    "Maros Landing.dc.html": "",
    "Catalogo.dc.html": "catalogo/",
    "Decants.dc.html": "decants/",
    "Packs.dc.html": "packs/",
    "Combo.dc.html": "combo/",
    "Contacto.dc.html": "contacto/",
}

ASSETS = ["support.js", "cart.js", "supabase-config.js"]

NOINDEX = '<meta name="robots" content="noindex, nofollow">'


def rewrite(html, depth):
    """Ajusta enlaces y recursos de una página según su profundidad."""
    up = "../" * depth

    # Enlaces entre páginas. Se aceptan las dos formas en que puede aparecer el
    # nombre con espacio: literal y escapado como %20.
    for src, dest in LINKS.items():
        target = up + dest if (up + dest) else "./"
        for variant in (src, src.replace(" ", "%20")):
            html = html.replace('href="%s"' % variant, 'href="%s"' % target)

    # Recursos compartidos, que viven en la raíz de docs/.
    for asset in ASSETS:
        html = html.replace('src="./%s"' % asset, 'src="%s%s"' % (up, asset))
    html = html.replace('href="_ds/', 'href="%s_ds/' % up)
    html = html.replace('src="_ds/', 'src="%s_ds/' % up)

    return html


def build_page(source, folder, depth, extra_head=""):
    path = os.path.join(ROOT, source)
    with open(path, encoding="utf-8") as fh:
        html = fh.read()

    html = rewrite(html, depth)

    if extra_head:
        anchor = '<script src="%ssupport.js"></script>' % ("../" * depth)
        if anchor not in html:
            raise SystemExit("No encontré dónde insertar el noindex en %s" % source)
        html = html.replace(anchor, extra_head + "\n" + anchor, 1)

    out_dir = os.path.join(DOCS, folder) if folder else DOCS
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "index.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    return os.path.relpath(out, ROOT)


def main():
    if not os.path.isdir(DOCS):
        raise SystemExit("Falta la carpeta docs/")

    written = []

    for source, folder, depth in PAGES:
        written.append(build_page(source, folder, depth))

    written.append(build_page("Admin.dc.html", "admin", 1, extra_head=NOINDEX))

    for asset in ASSETS:
        shutil.copy2(os.path.join(ROOT, asset), os.path.join(DOCS, asset))
        written.append(os.path.join("docs", asset))

    # Restos de la estructura anterior: las páginas sueltas .dc.html en docs/ y
    # el image-slot.js, que ya no usa ninguna página.
    for stale in os.listdir(DOCS):
        if stale.endswith(".dc.html"):
            os.remove(os.path.join(DOCS, stale))
            print("  eliminado (obsoleto): docs/%s" % stale)
    obsolete = os.path.join(DOCS, "image-slot.js")
    if os.path.exists(obsolete):
        os.remove(obsolete)
        print("  eliminado (obsoleto): docs/image-slot.js")

    print("\nPublicado en docs/:")
    for w in written:
        print("  %s" % w)

    # Comprobación: no debe quedar ninguna referencia a los nombres viejos.
    leftovers = []
    for dirpath, _dirs, files in os.walk(DOCS):
        for name in files:
            if not name.endswith((".html", ".js")):
                continue
            full = os.path.join(dirpath, name)
            with open(full, encoding="utf-8", errors="ignore") as fh:
                body = fh.read()
            for bad in re.findall(r'(?:href|src)="[^"]*\.dc\.html"', body):
                leftovers.append("%s -> %s" % (os.path.relpath(full, ROOT), bad))

    if leftovers:
        print("\nQuedaron enlaces al esquema viejo:")
        for l in leftovers:
            print("  %s" % l)
        return 1

    print("\nSin enlaces al esquema viejo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
