"""Lossless, per-source-sheet Fantasy atlas packing with native-safe pages."""
import binascii
import io
import json
from pathlib import Path
import struct

from PIL import Image
from import_units import (atlas_text, digest, texture_meta, stage_page_copy,
                          update_texture_dimensions, _planned_read,
                          _read_atlas_regions, attachment_regions)

MAXIMUM = 2048
COLOR_CHUNKS = {b'iCCP', b'sRGB', b'gAMA', b'cHRM', b'cICP', b'mDCV', b'cLLI'}


def color_chunks(raw):
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Fantasy atlas source is not PNG')
    chunks, at = [], 8
    while at + 12 <= len(raw):
        size = struct.unpack('>I', raw[at:at + 4])[0]
        kind, data = raw[at + 4:at + 8], raw[at + 8:at + 8 + size]
        if at + size + 12 > len(raw):
            raise ValueError('Truncated Fantasy source PNG')
        if kind in COLOR_CHUNKS:
            chunks.append((kind, data))
        at += size + 12
    return chunks


def source_colors(encoded, original):
    """Pillow's PNG writer drops some raw color chunks, including iCCP."""
    chunks, at = [encoded[:8]], 8
    while at + 12 <= len(encoded):
        size = struct.unpack('>I', encoded[at:at + 4])[0]
        kind = encoded[at + 4:at + 8]
        if kind not in COLOR_CHUNKS:
            chunks.append(encoded[at:at + size + 12])
        if kind == b'IHDR':
            for original_kind, data in color_chunks(original):
                chunks.append(struct.pack('>I', len(data)) + original_kind + data +
                              struct.pack('>I', binascii.crc32(original_kind + data) & 0xffffffff))
        at += size + 12
    return b''.join(chunks)


def _rectangles(images, bin_width, ordering):
    orders = {
        'side': lambda name: (-max(images[name]), -images[name][0] * images[name][1], name),
        'area': lambda name: (-images[name][0] * images[name][1], -max(images[name]), name),
        'height': lambda name: (-images[name][1], -images[name][0], name),
        'width': lambda name: (-images[name][0], -images[name][1], name)
    }
    remaining, pages = sorted(images, key=orders[ordering]), []
    while remaining:
        free, placed, waiting = [(0, 0, bin_width, MAXIMUM)], {}, []
        right = bottom = 0
        for name in remaining:
            width, height = images[name]
            width += 4; height += 4
            candidates = [(min(w - width, h - height), max(w - width, h - height), y, x)
                          for x, y, w, h in free if width <= w and height <= h]
            if not candidates:
                waiting.append(name)
                continue
            _, _, y, x = min(candidates)
            placed[name] = (x + 2, y + 2)
            right, bottom = max(right, x + width), max(bottom, y + height)
            split = []
            for fx, fy, fw, fh in free:
                if x >= fx + fw or x + width <= fx or y >= fy + fh or y + height <= fy:
                    split.append((fx, fy, fw, fh))
                    continue
                if x > fx: split.append((fx, fy, x - fx, fh))
                if x + width < fx + fw: split.append((x + width, fy, fx + fw - x - width, fh))
                if y > fy: split.append((fx, fy, fw, y - fy))
                if y + height < fy + fh: split.append((fx, y + height, fw, fy + fh - y - height))
            free = [a for index, a in enumerate(split)
                    if not any(index != other and a[0] >= b[0] and a[1] >= b[1]
                               and a[0] + a[2] <= b[0] + b[2] and a[1] + a[3] <= b[1] + b[3]
                               and (a != b or index > other) for other, b in enumerate(split))]
        if not placed:
            raise ValueError('Fantasy sprite exceeds the 2048px atlas limit including its sampling border')
        pages.append(dict(width=right, height=bottom, positions=placed))
        remaining = waiting
    return pages


def compact_layout(images):
    """Find bounded layouts without rotating or changing any sprite pixels."""
    dimensions = {name: (item['width'], item['height']) for name, item in images.items()}
    if not dimensions:
        raise ValueError('Fantasy source sheet has no drawable regions')
    if any(min(width, height) <= 0 or max(width, height) + 4 > MAXIMUM for width, height in dimensions.values()):
        raise ValueError('Fantasy sprite exceeds the 2048px atlas limit including its sampling border')
    best = best_key = None
    for transpose in (False, True):
        shapes = {name: ((h, w) if transpose else (w, h)) for name, (w, h) in dimensions.items()}
        sides = sorted({width + 4 for width, _ in shapes.values()})
        minimum = max(sides)
        widths = sorted({MAXIMUM, minimum} | {a + b for a in sides for b in sides if minimum <= a + b <= MAXIMUM})
        for width in widths:
            for ordering in ('side', 'area', 'height', 'width'):
                pages = _rectangles(shapes, width, ordering)
                if transpose:
                    pages = [dict(width=page['height'], height=page['width'],
                                  positions={name: (y, x) for name, (x, y) in page['positions'].items()}) for page in pages]
                key = (len(pages), sum(page['width'] * page['height'] for page in pages),
                       tuple((page['width'], page['height']) for page in pages))
                if best_key is None or key < best_key:
                    best, best_key = pages, key
    return best


def packed_pages(images, original):
    source = Image.open(io.BytesIO(original)).convert('RGBA')
    legal = max(source.size) <= MAXIMUM
    # Retaining an already legal sheet also preserves tightly touching source
    # cells that cannot gain two-pixel borders without an extra texture page.
    if any(max(item['width'], item['height']) + 4 > MAXIMUM for item in images.values()):
        if not legal:
            raise ValueError('Fantasy sprite exceeds the 2048px atlas limit')
        layouts = []
    else:
        layouts = compact_layout(images)
    if legal and (not layouts or len(layouts) > 1 or
                  sum(page['width'] * page['height'] for page in layouts) >= source.width * source.height):
        positions = {name: (item['rect']['x'], source.height - item['rect']['y'] - item['height']) for name, item in images.items()}
        return [(original, source.width, source.height)], {name: (0, x, y) for name, (x, y) in positions.items()}, 'retained'
    output, placements = [], {}
    for number, layout in enumerate(layouts):
        page = Image.new('RGBA', (layout['width'], layout['height']))
        for name, (x, y) in layout['positions'].items():
            image = images[name]['image']; width, height = image.size
            page.paste(image, (x, y))
            left, right = image.crop((0, 0, 1, height)), image.crop((width - 1, 0, width, height))
            top, bottom = image.crop((0, 0, width, 1)), image.crop((0, height - 1, width, height))
            for border in (1, 2):
                page.paste(left, (x - border, y)); page.paste(right, (x + width + border - 1, y))
                page.paste(top, (x, y - border)); page.paste(bottom, (x, y + height + border - 1))
            for dx in (-2, -1, width, width + 1):
                for dy in (-2, -1, height, height + 1):
                    page.putpixel((x + dx, y + dy), image.getpixel((max(0, min(width - 1, dx)), max(0, min(height - 1, dy)))))
            placements[name] = (number, x, y)
        encoded = io.BytesIO(); page.save(encoded, format='PNG')
        output.append((source_colors(encoded.getvalue(), original), page.width, page.height))
    return output, placements, 'repacked'


def _checked(tx, relative):
    raw = tx.read(relative)
    expected = tx.managed.get(relative)
    if expected and digest(raw) != expected:
        raise ValueError('Imported Fantasy asset was edited: ' + relative)
    return raw


def existing_units(tx, target, manifest):
    """Read every variant and verify the current rendered pixels before edits."""
    registered = {unit['skeleton']: unit['uuid'] for unit in manifest.get('units', [])}
    part_lookup = {'u_' + part['guid']: part for part in manifest.get('parts', [])}
    units, by_page = [], {}
    for file in tx.files(target + '/Units', '*.json'):
        relative = file.relative_to(tx.project).as_posix()
        rig = json.loads(tx.read(relative).decode('utf-8-sig'))
        raw = _checked(tx, relative[:-5] + '.atlas')
        regions, _ = _read_atlas_regions(raw)
        if attachment_regions(rig) - regions.keys():
            raise ValueError('Fantasy unit references a missing atlas region: ' + relative)
        meta = json.loads(tx.read(relative + '.meta').decode('utf-8-sig'))
        if relative in registered and meta.get('uuid') != registered[relative]:
            raise ValueError('Fantasy unit UUID differs from its catalog: ' + relative)
        for name, region in regions.items():
            if name not in part_lookup:
                raise ValueError('Fantasy atlas region has no original part: ' + name)
            if Path(region['page']).name != region['page']:
                raise ValueError('Fantasy atlas page leaves its unit folder')
            page_regions = by_page.setdefault(region['page'], {})
            previous = page_regions.get(name)
            if previous and (previous['xy'], previous['size']) != (region['xy'], region['size']):
                raise ValueError('Fantasy region coordinates differ between variants: ' + name)
            page_regions[name] = region
        units.append((relative, rig))
    if registered.keys() - {relative for relative, _ in units}:
        raise ValueError('Fantasy catalog references a missing registered unit')
    for page, regions in by_page.items():
        raw = _checked(tx, target + '/Units/' + page)
        canonical = _checked(tx, target + '/Atlases/' + page)
        if raw != canonical:
            raise ValueError('Fantasy native page differs from its canonical page: ' + page)
        image = Image.open(io.BytesIO(raw)).convert('RGBA')
        for name, region in regions.items():
            part = part_lookup[name]; source_raw = tx.read(part['image'])
            if digest(source_raw) != part['sha256']:
                raise ValueError('Fantasy source part was edited: ' + part['image'])
            source = Image.open(io.BytesIO(source_raw)).convert('RGBA')
            x, y = region['xy']; width, height = region['size']
            if (width, height) != source.size or min(x, y) < 0 or x + width > image.width or y + height > image.height:
                raise ValueError('Fantasy atlas region dimensions differ from its source part: ' + name)
            if image.crop((x, y, x + width, y + height)).tobytes() != source.tobytes():
                raise ValueError('Fantasy runtime pixels differ from their original part: ' + name)
    return units


def stage_sheets(tx, kind, manifest, parts, supplied=None):
    """Archive original sheets outside Cocos and retain page-zero identities."""
    target = 'assets/resources/unit-library/' + kind
    previous = {Path(record['originalAsset']).stem.removeprefix('sheet_'): record for record in manifest.get('sourceSheets', [])}
    grouped = {}
    for part in parts: grouped.setdefault(part['sheet'], []).append(part)
    records, regions, pages, originals = [], {}, {}, {}
    for sheet, entries in sorted(grouped.items()):
        filename = 'sheet_' + sheet + '.png'
        canonical, native = target + '/Atlases/' + filename, target + '/Units/' + filename
        old = previous.get(sheet, {})
        archive = 'authoring/unit-library/' + kind + '/sheets/' + filename
        if old and old.get('image') != archive:
            raise ValueError('Unexpected archived Fantasy sheet path')
        current = _checked(tx, canonical)
        current_native = _checked(tx, native)
        if current is not None and current_native is not None and current != current_native:
            raise ValueError('Fantasy native sheet differs from its canonical page: ' + filename)
        archived = _checked(tx, archive)
        if archived is not None and old.get('sha256') and digest(archived) != old['sha256']:
            raise ValueError('Archived Fantasy source sheet was edited: ' + archive)
        original = supplied[sheet]['asset'] if supplied and sheet in supplied else archived if archived is not None else current
        if original is None:
            raise ValueError('Missing original Fantasy source sheet: ' + sheet)
        source = Image.open(io.BytesIO(original)).convert('RGBA')
        images = {}
        for part in entries:
            raw = _planned_read(tx, part['image'])
            if digest(raw) != part['sha256']:
                raise ValueError('Fantasy source part was edited: ' + part['image'])
            image = Image.open(io.BytesIO(raw)).convert('RGBA')
            if image.size != (part['width'], part['height']):
                raise ValueError('Fantasy source part dimensions changed: ' + part['image'])
            rect = part['rect']; x, y = rect['x'], source.height - rect['y'] - rect['height']
            if min(x, y) < 0 or x + image.width > source.width or y + image.height > source.height:
                raise ValueError('Fantasy part leaves its original source sheet: ' + part['image'])
            if source.crop((x, y, x + image.width, y + image.height)).tobytes() != image.tobytes():
                raise ValueError('Fantasy part pixels differ from their original sheet: ' + part['image'])
            images[part['guid']] = dict(image=image, width=image.width, height=image.height,
                                        region='u_' + part['guid'], rect=rect)
        packed, positions, layout = packed_pages(images, original)
        tx.stage(archive, original)
        canonical_meta = tx.read(canonical + '.meta')
        native_meta = tx.read(native + '.meta')
        original_uuid = json.loads(canonical_meta.decode('utf-8-sig'))['uuid'] if canonical_meta else texture_meta(canonical, *source.size)['uuid']
        original_native_uuid = json.loads(native_meta.decode('utf-8-sig'))['uuid'] if native_meta else texture_meta(native, *source.size)['uuid']
        names = []
        for number, (raw, width, height) in enumerate(packed):
            name = 'sheet_' + sheet + ('-' + str(number) if number else '') + '.png'
            asset, copy_asset = target + '/Atlases/' + name, target + '/Units/' + name
            tx.stage(asset, raw)
            meta = tx.json(asset + '.meta', texture_meta(asset, width, height), True)
            tx.json(asset + '.meta', update_texture_dimensions(meta, width, height))
            copied = stage_page_copy(tx, asset, copy_asset)
            pages[name] = dict(width=width, height=height, uuid=copied['uuid'])
            names.append(name)
        for guid, (number, x, y) in positions.items():
            regions['u_' + guid] = dict(page=names[number], x=x, y=y, width=images[guid]['width'], height=images[guid]['height'])
        records.append(dict(old, image=archive, sha256=digest(original), originalAsset=canonical,
                            originalUuid=original_uuid, originalNativeAsset=native,
                            originalNativeUuid=original_native_uuid, originalSize=list(source.size),
                            layout=layout, runtimePages=names))
        originals[archive] = digest(original)
    return dict(records=records, regions=regions, pages=pages, originals=originals)


def unit_atlas(tx, relative, rig, packed):
    old = tx.read(relative[:-5] + '.atlas')
    old_regions, properties = _read_atlas_regions(old) if old else ({}, None)
    required = attachment_regions(rig)
    names = required | old_regions.keys()
    if names - packed['regions'].keys():
        raise ValueError('Fantasy atlas refers to an unknown source part: ' + str(sorted(names - packed['regions'].keys())))
    pages = sorted({packed['regions'][name]['page'] for name in names})
    images, positions, blocks = {}, {}, {}
    for name in names:
        info = packed['regions'][name]
        images[name] = dict(region=name, width=info['width'], height=info['height'])
        positions[name] = (pages.index(info['page']), info['x'], info['y'])
        if name in old_regions:
            region = old_regions[name]
            if region['size'] != (info['width'], info['height']):
                raise ValueError('Fantasy region size changed: ' + name)
            blocks[name] = region['block']
        else:
            blocks[name] = [name, '  rotate: false', '  xy: 0, 0',
                            '  size: ' + str(info['width']) + ', ' + str(info['height']),
                            '  orig: ' + str(info['width']) + ', ' + str(info['height']),
                            '  offset: 0, 0', '  index: -1']
    data = atlas_text(images, positions, [(b'', packed['pages'][name]['width'], packed['pages'][name]['height']) for name in pages],
                      pages, blocks, properties)
    return data, [packed['pages'][name]['uuid'] for name in pages]


def finish_manifest(tx, target, manifest, packed):
    managed = dict(manifest.get('importedFiles', {}))
    for relative, (_, after) in tx.plan.items():
        if relative.startswith(target + '/') and not relative.endswith('.meta') and relative != target + '/catalog.json':
            managed[relative] = digest(after)
    managed.update(packed['originals'])
    return dict(manifest, sourceSheets=packed['records'], importedFiles=managed,
                conversion=dict(manifest.get('conversion', {}), atlasMaxSize=MAXIMUM,
                                atlasPacking='source-sheet-full-rect-v1', atlasColorMetadata='source-preserved'))
