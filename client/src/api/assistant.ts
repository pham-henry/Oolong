import api from './client';

export async function askAssistant(question: string): Promise<string> {
  const res = await api.post('/assistant', { question });
  return res.data.answer;
}
