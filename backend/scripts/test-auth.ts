/**
 * Test Paystack and Twilio Authentication
 * Run: npx ts-node scripts/test-auth.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testPaystack(): Promise<boolean> {
    const secretKey = process.env.PAYSTACK_TEST_SECRET_KEY;
    
    if (!secretKey) {
        console.log('❌ Paystack: PAYSTACK_TEST_SECRET_KEY not set in .env');
        return false;
    }

    try {
        const response = await axios.get('https://api.paystack.co/bank', {
            headers: { Authorization: `Bearer ${secretKey}` }
        });
        console.log('✅ Paystack Auth SUCCESS');
        console.log(`   - Banks retrieved: ${response.data.data.length}`);
        console.log(`   - Message: ${response.data.message}`);
        return true;
    } catch (error: any) {
        console.log('❌ Paystack Auth FAILED:', error.response?.data?.message || error.message);
        return false;
    }
}

async function testTwilio(): Promise<boolean> {
    const accountSid = process.env.TWILIO_TEST_ACCOUNT_SID;
    const authToken = process.env.TWILIO_TEST_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        console.log('❌ Twilio: TWILIO_TEST_ACCOUNT_SID or TWILIO_TEST_AUTH_TOKEN not set in .env');
        return false;
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const twilio = require('twilio');
        const client = twilio(accountSid, authToken);
        const account = await client.api.accounts(accountSid).fetch();
        console.log('✅ Twilio Auth SUCCESS');
        console.log(`   - Account: ${account.friendlyName}`);
        console.log(`   - Status: ${account.status}`);
        return true;
    } catch (error: any) {
        console.log('❌ Twilio Auth FAILED:', error.message);
        return false;
    }
}

async function main() {
    console.log('\n🔐 Testing Payment & Notification Services...\n');
    console.log('Mode:', process.env.PAYMENT_MODE || 'test (default)');
    console.log('');
    
    const paystackOk = await testPaystack();
    console.log('');
    const twilioOk = await testTwilio();
    
    console.log('\n-------------------');
    console.log('Results:');
    console.log(`  Paystack: ${paystackOk ? '✅ OK' : '❌ FAILED'}`);
    console.log(`  Twilio:   ${twilioOk ? '✅ OK' : '❌ FAILED'}`);
    console.log('-------------------\n');

    process.exit(paystackOk && twilioOk ? 0 : 1);
}

main();
