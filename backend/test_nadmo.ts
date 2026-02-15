
import { nadmoIngestionService } from './src/services/data-hub/ingestion/nadmoIngestion';
import { query } from './src/database';
import path from 'path';

async function testIngestion() {
    try {
        console.log('Testing NADMO ingestion...');
        const csvPath = path.join(__dirname, 'nadmo_sample.csv');
        const result = await nadmoIngestionService.importFromCsv(csvPath);
        console.log('Ingestion result:', result);

        const check = await query('SELECT count(*) FROM flood_risk_incidents');
        console.log('Total incidents in DB:', check.rows[0].count);

        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

testIngestion();
