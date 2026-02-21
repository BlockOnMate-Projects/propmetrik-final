/**
 * WebSocket endpoint test for Workspace
 * Tests: connect, join, send message, edit, typing, presence, rate limit
 */
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const WS_URL = 'ws://localhost:4000/ws/workspace';
const WS_ID = '4214fd5d-1a4e-44c1-8146-645a8d84cb25';

let pass = 0, fail = 0;

function ok(name) { console.log(`  ✅ PASS  ${name}`); pass++; }
function ng(name, detail) { console.log(`  ❌ FAIL  ${name}  →  ${detail || ''}`); fail++; }

function makeToken(userId, orgId) {
    return jwt.sign(
        { id: userId, organizationId: orgId },
        SECRET,
        { expiresIn: '1h' }
    );
}

function connect(userId, orgId) {
    const token = makeToken(userId, orgId);
    return new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
}

function waitFor(ws, type, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
        const handler = (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === type) {
                    clearTimeout(timer);
                    ws.removeListener('message', handler);
                    resolve(msg);
                }
            } catch {}
        };
        ws.on('message', handler);
    });
}

async function runTests() {
    console.log('======================================');
    console.log('  WEBSOCKET ENDPOINT TESTS');
    console.log('======================================');
    console.log('');

    const USER_ID = 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f';
    const ORG_ID = '00000000-0000-0000-0000-000000000001';

    // --- Test 1: Connect with valid token ---
    console.log('[WS1] Connect with valid JWT');
    const ws1 = connect(USER_ID, ORG_ID);
    try {
        const connMsg = await waitFor(ws1, 'connected');
        if (connMsg.userId === USER_ID) ok('Connect with valid JWT');
        else ng('Connect with valid JWT', `userId=${connMsg.userId}`);
    } catch (e) { ng('Connect with valid JWT', e.message); }

    // --- Test 2: Join workspace ---
    console.log('[WS2] Join workspace');
    ws1.send(JSON.stringify({ type: 'join', workspaceId: WS_ID }));
    try {
        const joinMsg = await waitFor(ws1, 'joined');
        if (joinMsg.workspaceId === WS_ID && Array.isArray(joinMsg.messages)) {
            ok('Join workspace');
            console.log(`    messages: ${joinMsg.messages.length}, unread: ${joinMsg.unreadCount}, online: ${JSON.stringify(joinMsg.onlineUsers || [])}`);
        } else ng('Join workspace', JSON.stringify(joinMsg).slice(0, 100));
    } catch (e) { ng('Join workspace', e.message); }

    // --- Test 3: Send message ---
    console.log('[WS3] Send message via WS');
    ws1.send(JSON.stringify({ type: 'message', content: 'WS test message' }));
    try {
        const ackMsg = await waitFor(ws1, 'message_ack');
        if (ackMsg.messageId) ok('Send message via WS');
        else ng('Send message via WS', 'no messageId');
    } catch (e) { ng('Send message via WS', e.message); }

    // --- Test 4: Ping/Pong ---
    console.log('[WS4] Ping/Pong');
    ws1.send(JSON.stringify({ type: 'ping' }));
    try {
        const pongMsg = await waitFor(ws1, 'pong');
        ok('Ping/Pong');
    } catch (e) { ng('Ping/Pong', e.message); }

    // --- Test 5: Typing indicator ---
    console.log('[WS5] Typing indicator');
    // Connect second client to receive typing event
    const ws2 = connect(USER_ID.replace('ed4a50d7', 'fd4a50d7'), ORG_ID);
    await waitFor(ws2, 'connected');
    ws2.send(JSON.stringify({ type: 'join', workspaceId: WS_ID }));
    await waitFor(ws2, 'joined');
    // ws1 sends typing, ws2 should receive
    const typingPromise = waitFor(ws2, 'typing', 3000).catch(() => null);
    ws1.send(JSON.stringify({ type: 'typing' }));
    const typingMsg = await typingPromise;
    if (typingMsg && typingMsg.userId === USER_ID) ok('Typing indicator broadcast');
    else ng('Typing indicator broadcast', 'not received');

    // --- Test 6: Message broadcast to other client ---
    console.log('[WS6] Message broadcast to room');
    const broadcastPromise = waitFor(ws2, 'message', 3000).catch(() => null);
    ws1.send(JSON.stringify({ type: 'message', content: 'Broadcast test' }));
    await waitFor(ws1, 'message_ack'); // wait for ack first
    const bcMsg = await broadcastPromise;
    if (bcMsg && bcMsg.payload && bcMsg.payload.content) ok('Message broadcast to room');
    else ng('Message broadcast to room', 'not received by client2');

    // --- Test 7: Edit message ---
    console.log('[WS7] Edit message via WS');
    // First send a message and get its id
    ws1.send(JSON.stringify({ type: 'message', content: 'To be edited' }));
    const editAck = await waitFor(ws1, 'message_ack');
    const editId = editAck.messageId;
    // Subscribe ws2 for message_edited event
    const editPromise = waitFor(ws2, 'message_edited', 3000).catch(() => null);
    ws1.send(JSON.stringify({ type: 'edit_message', messageId: editId, content: 'Edited via WS' }));
    const editedMsg = await editPromise;
    if (editedMsg && editedMsg.messageId === editId && editedMsg.content === 'Edited via WS') ok('Edit message via WS');
    else ng('Edit message via WS', editedMsg ? JSON.stringify(editedMsg).slice(0, 100) : 'no event');

    // --- Test 8: Presence tracking ---
    console.log('[WS8] Presence - online users in joined payload');
    // ws2 already joined, check if onlineUsers was in join response
    // We'll reconnect a fresh client to check
    const ws3 = connect('aaaa0000-0000-0000-0000-000000000003', ORG_ID);
    await waitFor(ws3, 'connected');
    ws3.send(JSON.stringify({ type: 'join', workspaceId: WS_ID }));
    const join3 = await waitFor(ws3, 'joined');
    if (join3.onlineUsers && Array.isArray(join3.onlineUsers) && join3.onlineUsers.length >= 1) {
        ok(`Presence in join (${join3.onlineUsers.length} online)`);
    } else ng('Presence in join', `onlineUsers=${JSON.stringify(join3.onlineUsers)}`);

    // --- Test 9: Empty message rejected ---
    console.log('[WS9] Empty message rejected');
    const errPromise = waitFor(ws1, 'error', 2000).catch(() => null);
    ws1.send(JSON.stringify({ type: 'message', content: '   ' }));
    const errMsg = await errPromise;
    if (errMsg && errMsg.error) ok('Empty message rejected');
    else ng('Empty message rejected', 'no error event');

    // --- Test 10: Oversized message rejected ---
    console.log('[WS10] Oversized message (>10000 chars) rejected');
    const bigErrPromise = waitFor(ws1, 'error', 2000).catch(() => null);
    ws1.send(JSON.stringify({ type: 'message', content: 'x'.repeat(10001) }));
    const bigErr = await bigErrPromise;
    if (bigErr && bigErr.error && bigErr.error.includes('too long')) ok('Oversized message rejected');
    else ng('Oversized message rejected', bigErr ? bigErr.error : 'no error');

    // --- Test 11: Connect without token ---
    console.log('[WS11] Connect without token (should be rejected)');
    const badWs = new WebSocket(`${WS_URL}`);
    const closePromise = new Promise((resolve) => {
        badWs.on('close', (code) => resolve(code));
        setTimeout(() => resolve('timeout'), 3000);
    });
    const closeCode = await closePromise;
    if (closeCode === 4001) ok('No-token connection rejected (4001)');
    else ng('No-token connection rejected', `close code=${closeCode}`);

    // --- Cleanup ---
    ws1.close();
    ws2.close();
    ws3.close();

    console.log('');
    console.log('======================================');
    console.log(`  RESULTS: ${pass} PASSED, ${fail} FAILED (total: ${pass + fail})`);
    console.log('======================================');

    process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
