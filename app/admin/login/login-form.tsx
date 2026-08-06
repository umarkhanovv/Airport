'use client';

import { useActionState } from 'react';

import { login, type LoginState } from './actions';

const INITIAL: LoginState = {};

export function LoginForm({ returnTo }: { returnTo?: string }) {
  const [state, action, pending] = useActionState(login, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4">
      {returnTo ? <input type="hidden" name="next" value={returnTo} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Admin password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-describedby={state.error ? 'login-error' : undefined}
          aria-invalid={state.error ? true : undefined}
          className="border-border-strong bg-surface focus:ring-focus rounded-md border px-3 py-2 focus:ring-2 focus:outline-none"
        />
      </div>

      {state.error ? (
        // role="alert" so the failure is announced; a silent red border is
        // useless to anyone using a screen reader.
        <p id="login-error" role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-on-brand focus:ring-focus rounded-md px-4 py-2 font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
