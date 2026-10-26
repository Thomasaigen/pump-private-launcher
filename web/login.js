document.querySelector('#login').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
  const input = document.querySelector('#password'); const password = input.value; input.value = '';
  try {
    const response = await fetch('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'launcher' }, body: JSON.stringify({ password }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error); location.replace('/');
  } catch (error) { document.querySelector('#error').textContent = error.message; } finally { button.disabled = false; }
});
