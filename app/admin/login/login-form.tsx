'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { login, type LoginState } from './actions';

const INITIAL: LoginState = {};

export function LoginForm({ returnTo }: { returnTo?: string }) {
  const [state, action, pending] = useActionState(login, INITIAL);
  const t = useTranslations('Admin.login');

  return (
    <form action={action} className="flex flex-col gap-4">
      {returnTo ? <input type="hidden" name="next" value={returnTo} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-describedby={state.errorKey ? 'login-error' : undefined}
          aria-invalid={state.errorKey ? true : undefined}
          className="border-border-strong bg-surface focus:ring-focus rounded-md border px-3 py-2 focus:ring-2 focus:outline-none"
        />
      </div>

      {state.errorKey ? (
        // role="alert" so the failure is announced; a silent red border is
        // useless to anyone using a screen reader.
        <p id="login-error" role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(state.errorKey, state.params)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-on-brand focus:ring-focus rounded-md px-4 py-2 font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
      >
        {pending ? t('pending') : t('submit')}
      </button>
    </form>
  );
}
