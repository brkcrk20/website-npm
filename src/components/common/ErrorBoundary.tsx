import React from 'react';

// Global hata sınırı (rapor.txt §3 + rapor md. 91).
//
// Önceden herhangi bir bileşende beklenmedik bir JS hatası olduğunda
// kullanıcı bomboş beyaz bir ekran görüyordu: ne olduğunu anlatan bir
// mesaj, geri dönecek bir buton bile yoktu.
//
// Hata ekranı teknik değil, insan dilinde (md. 91): ne olduğunu söyler ve
// bir sonraki adımı gösterir. Teknik ayrıntı sadece konsola gider.

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Beklenmeyen bir hata yakalandı:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl border border-stone-200 p-6 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto text-2xl">
            ●
          </div>
          <div>
            <h1 className="text-base font-bold text-stone-900">Bir şeyler ters gitti</h1>
            <p className="text-xs text-stone-500 mt-1">
              Bu ekran yüklenirken beklenmedik bir sorun oldu. Tekrar deneyebilir ya da keşfete
              dönebilirsin.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="py-2.5 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-100 text-xs font-bold transition-colors cursor-pointer"
            >
              Tekrar dene
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/kesfet';
              }}
              className="py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Keşfete dön
            </button>
          </div>
        </div>
      </div>
    );
  }
}
