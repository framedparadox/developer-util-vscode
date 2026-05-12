import { DataConverter } from './converter/dataConverter';

// Test XML parsing
const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<fruits>
  <fruit>
    <name>Apple</name>
    <color>#FF0000</color>
  </fruit>
  <fruit>
    <name>Banana</name>
    <color>#FFFF00</color>
  </fruit>
</fruits>`;

const converter = new DataConverter();
const result = converter.convert(xmlContent, 'xml', 'json');

if (result.success) {
    console.log('XML to JSON output:');
    console.log(result.output);
} else {
    console.error('Conversion failed:', result.error);
}

// Test CSV parsing
const csvContent = `name,color,type
Apple,#FF0000,Pome
Banana,#FFFF00,Berry`;

const csvResult = converter.convert(csvContent, 'csv', 'json');

if (csvResult.success) {
    console.log('\nCSV to JSON output:');
    console.log(csvResult.output);
} else {
    console.error('CSV Conversion failed:', csvResult.error);
}
