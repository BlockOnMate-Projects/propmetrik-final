import { reportTemplateService } from '../src/services/valuation-engine/reportTemplateService';
import { logger } from '../src/utils/logger';

async function testGeneration() {
  try {
    console.log('Testing Modular Template Loading...');
    const template = await reportTemplateService.loadTemplate('ghis_standard');
    console.log('Template Loaded Successfully!');
    console.log('Template Name:', template.name);
    console.log('Template ID:', template.template_id);
    console.log('Section Count:', template.sections.length);
    console.log('Sections:', template.sections.map(s => `${s.order}. ${s.title}`).join('\n'));
    
    if (template.sections.length < 10) {
        console.error('FAIL: Expected at least 10 sections');
        process.exit(1);
    }
    
    // Check specific specific title
    const hasChap4 = template.sections.some(s => s.title.includes('Chapter Four'));
    if (!hasChap4) {
        console.error('FAIL: Missing Chapter Four');
        process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Template Load Failed:', error);
    process.exit(1);
  }
}

testGeneration();