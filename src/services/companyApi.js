// Uses Vite proxy: /api → backend server (no hardcoded port)
const BASE_URL = '/api';

const handleResponse = async (res) => {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

export const companyApi = {
  getAll: () =>
    fetch(`${BASE_URL}/companies`).then(handleResponse),

  add: (company) =>
    fetch(`${BASE_URL}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(company),
    }).then(handleResponse),

  update: (id, company) =>
    fetch(`${BASE_URL}/companies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(company),
    }).then(handleResponse),

  delete: (id) =>
    fetch(`${BASE_URL}/companies/${id}`, {
      method: 'DELETE',
    }).then(handleResponse),
};