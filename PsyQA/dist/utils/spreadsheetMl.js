"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSpreadsheetMl = buildSpreadsheetMl;
function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function cell(value, type = 'String') {
    const v = escapeXml(String(value !== null && value !== void 0 ? value : ''));
    return `<Cell><Data ss:Type="${type}">${v}</Data></Cell>`;
}
function row(cells, types) {
    const inner = cells
        .map((c, i) => { var _a; return cell(c, (_a = types === null || types === void 0 ? void 0 : types[i]) !== null && _a !== void 0 ? _a : (typeof c === 'number' ? 'Number' : 'String')); })
        .join('');
    return `<Row>${inner}</Row>`;
}
/** 生成 Excel 可直接打开的 SpreadsheetML（.xls） */
function buildSpreadsheetMl(sheetName, tableRows) {
    const tableBody = tableRows.map((r) => row(r)).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E8F5E9" ss:Pattern="Solid"/></Style>
</Styles>
<Worksheet ss:Name="${escapeXml(sheetName.slice(0, 31))}">
<Table>
${tableBody}
</Table>
</Worksheet>
</Workbook>`;
}
