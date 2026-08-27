#!/bin/bash
#
# Claude Code on the web oturumu açılırken bağımlılıkları kurar.
#
# Neden gerekli: uzak oturumda depo sıfırdan klonlanıyor ve `node_modules/`
# gelmiyor. Kurulum yapılmadan `npm run lint` çalıştırıldığında komut sessizce
# BAŞARISIZ OLMUYOR — sistemdeki genel `tsc` (farklı bir sürüm) devreye girip
# projenin `typescript@~5.8` ayarlarıyla uyuşmayan hatalar üretiyor:
#
#   vite.config.ts(4,28): error TS2307: Cannot find module 'vite'
#   src/services/listingService.ts(435,36): error TS7006: implicitly 'any'
#
# Yani doğrulama "kirli" görünüyor ama sorun kodda değil, eksik kurulumda.
# CLAUDE.md lint/test/build üçünün de temiz olmasını şart koştuğu için bu
# tuzak her uzak oturumun başında zaman kaybettiriyordu.
set -euo pipefail

# Yalnızca uzak (web) oturumlarda çalışsın; yerel checkout'ta geliştiricinin
# kendi node_modules'ına dokunmaya gerek yok.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# `npm ci` değil `npm install`: kurulum bittikten sonra konteyner durumu
# önbelleğe alınıyor, `install` var olan node_modules'ı yeniden kullanabildiği
# için sonraki oturumlar çok daha hızlı başlıyor. Tekrar çalıştırmak güvenli.
npm install --no-audit --no-fund
