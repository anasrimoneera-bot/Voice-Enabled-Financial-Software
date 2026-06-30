'use strict';

/*
 * 极简 XLSX 写出器（零依赖）。
 * XLSX = ZIP 容器 + 若干 XML。此处用纯 JS 实现 ZIP（stored，无压缩）+ CRC32，
 * 生成的文件可被 Excel / WPS / Numbers 正常打开。
 *
 * 用法：const blob = window.XlsxWriter.build('财务流水', header, rows);
 *   header: 字符串数组（表头）
 *   rows:   二维数组，数字写为数值单元格，字符串写为文本单元格，空串跳过
 */
(function () {
  const enc = new TextEncoder();

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

  // 将 [{name, data:Uint8Array}] 打包为 ZIP（stored）Blob
  function zip(files) {
    const parts = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const crc = crc32(f.data);
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length), u16(nameBytes.length), u16(0)
      );
      const localHeader = new Uint8Array(local.length + nameBytes.length);
      localHeader.set(local, 0);
      localHeader.set(nameBytes, local.length);
      parts.push(localHeader, f.data);

      const cd = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length), u16(nameBytes.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      );
      const centralHeader = new Uint8Array(cd.length + nameBytes.length);
      centralHeader.set(cd, 0);
      centralHeader.set(nameBytes, cd.length);
      central.push(centralHeader);

      offset += localHeader.length + f.data.length;
    }

    const cdStart = offset;
    let cdSize = 0;
    central.forEach((c) => { cdSize += c.length; });
    const eocd = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cdSize), u32(cdStart), u16(0)
    ));

    return new Blob([...parts, ...central, eocd], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function colLetter(i) {
    let s = '';
    i += 1;
    while (i > 0) {
      const m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  function buildSheet(header, rows) {
    const all = [header, ...rows];
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    xml += `<dimension ref="A1:${colLetter(header.length - 1)}${all.length}"/>`;
    xml += '<sheetData>';
    all.forEach((row, ri) => {
      const r = ri + 1;
      xml += `<row r="${r}">`;
      row.forEach((val, ci) => {
        if (val === '' || val === null || val === undefined) return;
        const ref = colLetter(ci) + r;
        if (typeof val === 'number' && isFinite(val)) {
          xml += `<c r="${ref}"><v>${val}</v></c>`;
        } else {
          xml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(val))}</t></is></c>`;
        }
      });
      xml += '</row>';
    });
    xml += '</sheetData></worksheet>';
    return xml;
  }

  const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '</Types>';

  const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

  const WB_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '</Relationships>';

  function workbook(sheetName) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>`
      + '</workbook>';
  }

  function build(sheetName, header, rows) {
    const files = [
      { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
      { name: 'xl/workbook.xml', data: enc.encode(workbook(sheetName)) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(WB_RELS) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(buildSheet(header, rows)) },
    ];
    return zip(files);
  }

  window.XlsxWriter = { build };
})();
