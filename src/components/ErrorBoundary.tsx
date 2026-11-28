import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
    try {
      const payload = JSON.stringify({
        message: error?.message || String(error),
        path: typeof window !== 'undefined' ? window.location.pathname : '/',
        stack: [error?.stack || '', info?.componentStack || ''].filter(Boolean).join('\n').slice(0, 2400),
      });
      void fetch('/api/public/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore reporting failures
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const isEn =
        typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en');
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#0E0E0E] px-4 py-12 text-[#FBEFDD]">
          <div className="w-full max-w-md rounded-3xl border border-[#FF502B]/30 bg-[#121212] p-7 text-center shadow-2xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#FF502B]/15 text-[#FF502B]">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-extrabold text-[#FBEFDD]">
              {isEn ? 'Something went wrong' : 'یک خطای غیرمنتظره رخ داد'}
            </h1>
            <p className="mt-2 text-xs leading-6 text-[#FBEFDD]/70">
              {isEn
                ? 'No worries — if you were editing a post, your draft is safely saved in the browser. You can try again or reload the page.'
                : 'نگران نباش، اگر در حال نوشتن مقاله بودی پیش‌نویس به‌صورت خودکار در مرورگر ذخیره شده است. می‌توانی دوباره تلاش کنی یا صفحه را بازآوری کنی.'}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-2xl px-5 py-2.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isEn ? 'Try Again' : 'تلاش مجدد'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="cursor-pointer rounded-2xl border border-[#FBEFDD]/20 bg-[#0E0E0E] px-4 py-2.5 text-xs text-[#FBEFDD]/85 hover:border-[#FF502B]"
              >
                {isEn ? 'Reload Page' : 'بازآوری صفحه'}
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
