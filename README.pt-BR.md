# RTC Tax

[English](README.md)

SDK TypeScript para calcular CBS e IBS da Reforma Tributária do Consumo com as
calculadoras oficiais da Receita Federal: Regime Regular e Simples Nacional. O
SDK não implementa regras tributárias; todo cálculo é feito pelos motores
oficiais.

Projeto independente, sem afiliação ou endosso da Receita Federal.

> **Status: v0.1.0 experimental.** Bom para desenvolvimento, testes e
> avaliação. Para produção, rode os motores oficiais no seu ambiente e use o
> modo remoto. Leia as [limitações](#verificação-e-limitações) antes.

## Requisitos

- Node.js 20 ou superior. Em produção, use uma versão LTS ainda suportada; o
  Node 20 chegou ao fim de vida.
- Somente ESM; CommonJS ainda não é suportado.
- **Modo local:** Docker em execução. Na primeira chamada de cada motor, o SDK
  baixa o código oficial, compila e prepara o banco SQLite. Isso exige
  internet, pode levar vários minutos e ocupa cerca de 1 GB de disco por motor.
  Depois disso, cada processo novo ainda espera os motores Java iniciarem
  (dezenas de segundos). O uso do SDK não exige comandos Docker manuais.
- **Modo remoto:** não precisa de Docker. Você hospeda os motores oficiais e
  informa as URLs.

## Instalação

```sh
npm install @rtc-tax/sdk
```

## Uso

```ts
import { RTCTax } from '@rtc-tax/sdk';

const rtc = await RTCTax.local();
try {
  const result = await rtc.regimeRegular.calculate({
    id: '6194602ea71cbf9431c236de4409d920', versao: '1.0.0',
    dhFatoGerador: '2027-03-10T10:00:00-03:00', municipio: 4314902, uf: 'RS',
    itens: [{ numero: 3, nbs: '122011200', cst: '200', cClassTrib: '200028', baseCalculo: '1200.00',
      aliquotasNominais: { cbs: '8.8', ibsEstadual: '0.05', ibsMunicipal: '0.05' } }]
  });
  const taxes = result.objetos[0].tribCalc?.IBSCBS?.gIBSCBS;
  console.log(taxes?.gCBS?.vCBS, taxes?.vIBS); // "42.24" "0.48"
} finally {
  await rtc.close();
}
```

Os dados são sintéticos e as alíquotas de 2027 entram como simulação
(`calculoSimulado: true`). O [exemplo completo](examples/calculate.mjs) também
calcula uma operação do Simples Nacional.

Para motores hospedados por você, `RTCTax.remote({ regimeRegularUrl,
simplesNacionalUrl, timeoutMs?, headers? })` usa as URLs base e não precisa de
Docker. HTTPS e controle de acesso ficam por sua conta. As URLs podem ter
prefixo de caminho, e os headers valem para os dois clientes.

Informe valores decimais como texto, por exemplo `"1200.00"` e `"0.05"`;
números JavaScript são aceitos apenas como inteiros seguros. A resposta preserva
números decimais e inteiros inseguros como texto. No Simples, verifique o
`estadoItem` e os erros de cada item mesmo em respostas HTTP 200.

## Próximos passos

Sem data definida; a ordem depende do retorno de quem testar.

- Imagens prontas dos motores e um `docker-compose.yml` para facilitar o modo
  remoto (depende da revisão de licenças).
- Mostrar, de forma opcional, o detalhe dos erros do motor, como um HTTP 422.
- Tipos mais completos e validação de entrada.
- Um comando para preparar os motores antes do primeiro cálculo.
- O endpoint atual do Simples Nacional, que substitui o endpoint clássico.
- Validar o modo local no Windows.

## Testou? Conte como foi

Abra uma [issue](https://github.com/guilherme-braga4/rtc-tax/issues) dizendo o
que tentou, o que esperava e o que aconteceu, inclusive se travou na
instalação. Relatos de uso em ERP, e-commerce ou emissão de NF-e ajudam a
priorizar os próximos passos. Nunca anexe dados fiscais reais.

## Desenvolvimento

```sh
npm ci
npm run build
node examples/calculate.mjs
```

Use `npm test` para testes unitários e `npm run test:integration` para executar
os cálculos reais no modo local. `npm run test:installed-server` instala o
pacote em um servidor HTTP Node separado; configure `RTC_SERVER_MODE=local`
para usar os motores Docker, ou consulte os pré-requisitos do modo remoto no
relatório do spike.

## Verificação e limitações

Os motores iniciam sob demanda e são compartilhados por processos Node do
mesmo usuário, host, Docker Engine e diretório de coordenação. Por padrão, o
SDK usa `~/.cache/rtc-tax`; `RTC_TAX_COORDINATION_DIR` permite escolher outro
diretório local. Uma interrupção abrupta pode deixar o contêiner ativo até
uma operação posterior recuperar a locação. Se o estado de propriedade estiver
inconsistente ou ausente, o SDK falha sem encerrar o contêiner e pode exigir
inspeção manual. A coordenação entre hosts ou usuários diferentes não é
oferecida.

Os artefatos Maven estão fixados por SHA-256; a primeira captura do conjunto
ainda é uma fonte de confiança. O CI hospedado passou nos testes unitários em Linux, macOS e Windows e nos testes dos motores em Ubuntu. A execução local com Docker no Windows ainda não foi validada;
consulte [versões e integridade](docs/versions-and-integrity.md), o
[inventário de licenças](docs/third-party/README.md), o
[relatório do spike](docs/feasibility-spike.md) e o [README em inglês](README.md).
Os dois motores usam a base V0073, em versões fixadas que não garantem dados
atuais. O cliente do Simples usa o endpoint clássico que a Receita marcou como
obsoleto; a revisão oficial fixada e os limites constam no relatório do spike.
