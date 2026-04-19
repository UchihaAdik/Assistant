import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await register(email, password, name);
      authLogin(token, user);
      navigate('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6" style={{ background: '#212121' }}>
      <div className="mb-8 flex flex-col items-center gap-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold"
          style={{ background: '#cc785c', color: '#fff' }}
        >
          A
        </div>
        <h1 className="text-xl font-semibold" style={{ color: '#ececec' }}>Создать аккаунт</h1>
        <p className="text-sm text-center" style={{ color: '#8e8ea0' }}>
          Начни трекать свою жизнь
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-sm space-y-3">
        <input
          type="text"
          placeholder="Имя (необязательно)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.1)', color: '#ececec' }}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.1)', color: '#ececec' }}
        />
        <input
          type="password"
          placeholder="Пароль (минимум 6 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.1)', color: '#ececec' }}
        />

        {error && (
          <p className="text-sm text-center" style={{ color: '#f87171' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
          style={{ background: '#cc785c', color: '#fff', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Создание...' : 'Создать аккаунт'}
        </button>
      </form>

      <p className="mt-6 text-sm" style={{ color: '#8e8ea0' }}>
        Уже есть аккаунт?{' '}
        <Link to="/login" className="font-medium" style={{ color: '#cc785c' }}>
          Войти
        </Link>
      </p>
    </div>
  );
}
