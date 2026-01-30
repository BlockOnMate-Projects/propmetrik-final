const https = require('https');
const qs = require('querystring');

const tokenData = qs.stringify({
  grant_type: 'client_credentials',
  client_id: 'propmetrik-api',
  client_secret: '4JP1ubsCOkaZAaoY8Ec6CkDflw7gP8AK'
});

const req = https.request({
  hostname: 'sso.cedynhq.com',
  path: '/realms/propmetrik/protocol/openid-connect/token',
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': tokenData.length }
}, (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => {
    const token = JSON.parse(data).access_token;
    
    const req2 = https.request({
      hostname: 'sso.cedynhq.com',
      path: '/admin/realms/propmetrik/clients',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, (res2) => {
      let data2 = '';
      res2.on('data', (c) => data2 += c);
      res2.on('end', () => {
        const clients = JSON.parse(data2);
        console.log('All clients in propmetrik realm:');
        clients.forEach(c => console.log(' -', c.clientId, '(', c.id, ')'));
      });
    });
    req2.end();
  });
});
req.write(tokenData);
req.end();
