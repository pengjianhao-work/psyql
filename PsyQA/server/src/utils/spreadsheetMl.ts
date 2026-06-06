function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cell(value: string | number, type: 'String' | 'Number' = 'String'): string {
  const v = escapeXml(String(value ?? ''));
  return `<Cell><Data ss:Type="${type}">${v}</Data></Cell>`;
}

function row(cells: Array<string | number>, types?: Array<'String' | 'Number'>): string {
  const inner = cells
    .map((c, i) => cell(c, types?.[i] ?? (typeof c === 'number' ? 'Number' : 'String')))
    .join('');
  return `<Row>${inner}</Row>`;
}

/** 生成 Excel 可直接打开的 SpreadsheetML（.xls） */
export function buildSpreadsheetMl(sheetName: string, tableRows: Array<Array<string | number>>): string {
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
