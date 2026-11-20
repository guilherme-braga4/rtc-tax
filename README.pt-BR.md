# RTC Tax

SDK TypeScript em desenvolvimento para as calculadoras oficiais do Regime
Regular e do Simples Nacional. Projeto independente, sem afiliação ou endosso
da Receita Federal. Os cálculos são realizados pelos motores oficiais.

**Status: pré-lançamento; não publicado nem pronto para produção.** O exemplo
utiliza dados sintéticos e alíquotas simuladas no Regime Regular.

## Execução no repositório

É necessário Node.js 20 ou superior e Docker operacional no modo local. Para produção, use uma versão LTS do Node.js ainda suportada; o Node 20 chegou ao fim de vida. O
pacote oferece imports ESM; CommonJS ainda não é suportado. A
primeira chamada de cada motor requer internet e espaço em disco para obter e
compilar o código oficial e preparar o banco SQLite. O uso do SDK não exige
comandos Docker manuais.

```sh
npm ci
npm run build
node examples/calculate.mjs
```

A API disponibiliza `RTCTax.local()` e `RTCTax.remote({ regimeRegularUrl,
simplesNacionalUrl })`. Use `await rtc.close()` no bloco `finally`. Consulte o
[exemplo completo](examples/calculate.mjs).

Informe valores decimais como texto, por exemplo `"1200.00"` e `"0.05"`;
números JavaScript são aceitos apenas como inteiros seguros. A resposta preserva
números decimais e inteiros inseguros como texto. No Simples, verifique o
`estadoItem` e os erros de cada item mesmo em respostas HTTP 200.

Os motores iniciam sob demanda e são compartilhados por processos Node do
mesmo usuário, host, Docker Engine e diretório de coordenação. Por padrão, o
SDK usa `~/.cache/rtc-tax`; `RTC_TAX_COORDINATION_DIR` permite escolher outro
diretório local. Uma interrupção abrupta pode deixar o contêiner ativo até
uma operação posterior recuperar a locação. Se o estado de propriedade estiver
inconsistente ou ausente, o SDK falha sem encerrar o contêiner e pode exigir
inspeção manual. A coordenação entre hosts ou usuários diferentes não é
oferecida.

Os artefatos Maven estão fixados por SHA-256; a primeira captura do conjunto
ainda é uma fonte de confiança. Há limites na validação entre plataformas;
consulte [versões e integridade](docs/versions-and-integrity.md), o
[inventário de licenças](docs/third-party/README.md), o
[relatório do spike](docs/feasibility-spike.md) e o [README em inglês](README.md).
Os dois motores usam a base V0073, em versões fixadas que não garantem dados
atuais. O cliente do Simples usa o endpoint clássico que a Receita marcou como
obsoleto; a revisão oficial fixada e os limites constam no relatório do spike.

Use `npm test` para testes unitários e `npm run test:integration` para executar
os cálculos reais no modo local. `npm run test:installed-server` instala o
pacote em um servidor HTTP Node separado; configure `RTC_SERVER_MODE=local`
para usar os motores Docker, ou consulte os pré-requisitos do modo remoto no
relatório do spike. O pacote ainda não foi publicado no npm.
