(function (root) {
    'use strict';
    // Runs in an isolated, hidden Chromium window. Inputs and outputs are plain JSON.
    function loadImage(url) {
        return new Promise(function (resolve, reject) {
            var image = new Image();
            image.onload = function () { resolve(image); };
            image.onerror = function () { reject(new Error('Cannot decode template image.')); };
            image.src = url;
        });
    }
    function resolveText(catalog, key, locale, depth) {
        if ((depth || 0) > 8) throw new Error('Circular translation reference: ' + key);
        var entry = catalog.entries[key];
        if (!entry) throw new Error('Unknown artwork translation key: ' + key);
        var text = entry[locale];
        if (typeof text !== 'string' || !text.trim()) text = entry[catalog.defaultLanguage];
        if (typeof text !== 'string' || !text.trim()) throw new Error('Missing artwork translation: ' + key + ' [' + locale + ']');
        return text.replace(/\[\[loc:([A-Za-z0-9_.-]+)\]\]/g, function (_, nested) {
            return resolveText(catalog, nested, locale, (depth || 0) + 1);
        }).replace(/<\/?(?:b|i|u|color|c|size|outline|on|br|img)(?=[\s=/>])[^>]*>/gi, function (tag) {
            return /^<br/i.test(tag) ? '\n' : '';
        });
    }
    function wrapText(context, text, width, wrap) {
        var lines = [];
        text.split('\n').forEach(function (paragraph) {
            if (!wrap) { lines.push(paragraph); return; }
            var words = paragraph.match(/\S+\s*|\s+/g) || [''];
            var line = '';
            words.forEach(function (word) {
                if (line && context.measureText(line + word).width > width) { lines.push(line.trim()); line = ''; }
                // Splits long CJK runs and unbreakable words only when needed.
                Array.from(word).forEach(function (character) {
                    if (line && context.measureText(line + character).width > width) { lines.push(line.trim()); line = ''; }
                    line += character;
                });
            });
            lines.push(line.trim());
        });
        return lines;
    }
    function fontStyle(region, size, family) {
        return (region.italic ? 'italic ' : '') + (region.bold ? 'bold ' : '') + size + 'px "' + family + '"';
    }
    function textCanvas(catalog, region, locale, fonts) {
        var rect = region.rect;
        var canvas = document.createElement('canvas');
        canvas.width = Math.ceil(rect.width); canvas.height = Math.ceil(rect.height);
        var ctx = canvas.getContext('2d');
        var text = resolveText(catalog, region.key, locale);
        var overrides = region.locales && region.locales[locale];
        if (overrides) region = Object.assign({}, region, overrides);
        var family = fonts[region.font] || region.fontFamily || 'Arial';
        var padding = region.padding === undefined ? Math.max(2, (region.outlineWidth || 0) * 2) : region.padding;
        var width = Math.max(1, canvas.width - padding * 2), height = Math.max(1, canvas.height - padding * 2);
        var size = region.fontSize || Math.floor(height * 0.8), minimum = region.minFontSize || 6, lines, lineHeight;
        do {
            ctx.font = fontStyle(region, size, family);
            lines = wrapText(ctx, text, width, region.wrap !== false);
            lineHeight = size * (region.lineHeightRatio || 1.12);
            if (lines.length * lineHeight <= height && lines.every(function (line) { return ctx.measureText(line).width <= width; })) break;
            size--;
        } while (size >= minimum);
        if (size < minimum) throw new Error('Artwork text cannot fit ' + region.key + ' [' + locale + '] within ' + rect.width + 'x' + rect.height);
        ctx.textAlign = region.align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        var x = ctx.textAlign === 'left' ? padding : ctx.textAlign === 'right' ? canvas.width - padding : canvas.width / 2;
        var y = (canvas.height - lines.length * lineHeight) / 2 + lineHeight / 2 + (region.baselineOffset || 0);
        var fill = region.color || '#ffffff';
        if (region.gradient && region.gradient.length) {
            var gradient = ctx.createLinearGradient(0, y - lineHeight / 2, 0, y + (lines.length - 0.5) * lineHeight);
            region.gradient.forEach(function (color, i) { gradient.addColorStop(i / Math.max(1, region.gradient.length - 1), color); });
            fill = gradient;
        }
        lines.forEach(function (line, index) {
            ctx.save();
            if (region.shadow) {
                ctx.shadowColor = region.shadow.color || '#000000'; ctx.shadowBlur = region.shadow.blur || 0;
                ctx.shadowOffsetX = region.shadow.offsetX || 0; ctx.shadowOffsetY = region.shadow.offsetY || 0;
            }
            if (region.outlineWidth) { ctx.lineWidth = region.outlineWidth * 2; ctx.strokeStyle = region.outlineColor || '#000000'; ctx.strokeText(line, x, y + index * lineHeight); }
            ctx.fillStyle = fill; ctx.fillText(line, x, y + index * lineHeight); ctx.restore();
        });
        return { canvas: canvas, fontSize: size, lines: lines.length, key: region.key };
    }
    function point(quad, u, v) {
        return {
            x: quad[0].x * (1-u)*(1-v) + quad[1].x*u*(1-v) + quad[2].x*u*v + quad[3].x*(1-u)*v,
            y: quad[0].y * (1-u)*(1-v) + quad[1].y*u*(1-v) + quad[2].y*u*v + quad[3].y*(1-u)*v
        };
    }
    function triangle(ctx, image, src, dst) {
        var a = src[0], b = src[1], c = src[2], p = dst[0], q = dst[1], r = dst[2];
        var determinant = a.x*(b.y-c.y) + b.x*(c.y-a.y) + c.x*(a.y-b.y);
        if (!determinant) return;
        function coeff(field) { return [
            (p[field]*(b.y-c.y)+q[field]*(c.y-a.y)+r[field]*(a.y-b.y))/determinant,
            (p[field]*(c.x-b.x)+q[field]*(a.x-c.x)+r[field]*(b.x-a.x))/determinant,
            (p[field]*(b.x*c.y-c.x*b.y)+q[field]*(c.x*a.y-a.x*c.y)+r[field]*(a.x*b.y-b.x*a.y))/determinant
        ]; }
        var x = coeff('x'), y = coeff('y');
        ctx.save(); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.lineTo(r.x,r.y); ctx.closePath(); ctx.clip();
        ctx.transform(x[0],y[0],x[1],y[1],x[2],y[2]); ctx.drawImage(image,0,0); ctx.restore();
    }
    function drawQuad(ctx, image, quad) {
        var count = 10;
        for (var row = 0; row < count; row++) for (var col = 0; col < count; col++) {
            var u=col/count, v=row/count, u2=(col+1)/count, v2=(row+1)/count;
            var s=[{x:u*image.width,y:v*image.height},{x:u2*image.width,y:v*image.height},{x:u2*image.width,y:v2*image.height},{x:u*image.width,y:v2*image.height}];
            var d=[point(quad,u,v),point(quad,u2,v),point(quad,u2,v2),point(quad,u,v2)];
            triangle(ctx,image,[s[0],s[1],s[2]],[d[0],d[1],d[2]]); triangle(ctx,image,[s[0],s[2],s[3]],[d[0],d[2],d[3]]);
        }
    }
    function background(ctx, value, width, height) {
        if (typeof value === 'string') { ctx.fillStyle = value; ctx.fillRect(0,0,width,height); return; }
        var x=value.x || 0, y=value.y || 0, w=value.width || width, h=value.height || height;
        var r=Math.min(value.radius || 0,w/2,h/2);
        ctx.save(); ctx.fillStyle=value.fill || '#000000';
        ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
        ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
        ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
        ctx.fill(); if(value.stroke){ctx.strokeStyle=value.stroke;ctx.lineWidth=value.strokeWidth || 1;ctx.stroke();} ctx.restore();
    }
    async function compile(request) {
        var fonts = {}, outputs = [], metrics = [];
        var fontPaths = Object.keys(request.fonts);
        for (var f = 0; f < fontPaths.length; f++) {
            var fontPath = fontPaths[f], family = 'LocalizationFont' + f;
            var face = new FontFace(family, 'url(' + request.fonts[fontPath] + ')');
            await face.load(); document.fonts.add(face); fonts[fontPath] = family;
        }
        var ids = Object.keys(request.templates);
        for (var t = 0; t < ids.length; t++) {
            var id = ids[t], template = request.templates[id];
            var image = template.sourceData ? await loadImage(template.sourceData) : null;
            if (image && (image.width !== template.width || image.height !== template.height)) throw new Error('Template ' + id + ' image dimensions differ from metadata.');
            var locales = template.languages || request.catalog.languages.map(function (l) { return l.code; });
            for (var l = 0; l < locales.length; l++) {
                var locale = locales[l], canvas = document.createElement('canvas');
                canvas.width = template.width; canvas.height = template.height;
                var ctx = canvas.getContext('2d');
                if (template.background) background(ctx,template.background,canvas.width,canvas.height);
                if (image) ctx.drawImage(image, 0, 0);
                for (var index = 0; index < template.regions.length; index++) {
                    var originalRegion = template.regions[index];
                    var region = Object.assign({},originalRegion,originalRegion.locales && originalRegion.locales[locale]);
                    var rendered = textCanvas(request.catalog, region, locale, fonts), rect = region.rect;
                    ctx.save();
                    if (region.clip && region.clip.length >= 3) {
                        ctx.beginPath(); ctx.moveTo(region.clip[0].x,region.clip[0].y);
                        region.clip.slice(1).forEach(function(p){ctx.lineTo(p.x,p.y);}); ctx.closePath(); ctx.clip();
                    }
                    if (region.opacity !== undefined) ctx.globalAlpha = region.opacity;
                    if (region.quad) drawQuad(ctx, rendered.canvas, region.quad);
                    else {
                        ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
                        ctx.rotate((region.angle || 0) * Math.PI / 180);
                        ctx.drawImage(rendered.canvas, -rect.width / 2, -rect.height / 2);
                    }
                    ctx.restore();
                    metrics.push({ template: id, locale: locale, key: region.key, fontSize: rendered.fontSize, lines: rendered.lines });
                }
                outputs.push({ template: id, locale: locale, data: canvas.toDataURL('image/png').split(',')[1], width: canvas.width, height: canvas.height });
            }
        }
        return { outputs: outputs, metrics: metrics };
    }
    root.LocalizationArtRenderer = { compile: compile, wrapText: wrapText, resolveText: resolveText };
})(typeof window !== 'undefined' ? window : globalThis);
