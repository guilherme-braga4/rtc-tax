import { RTCTax } from '@rtc-tax/sdk';

const rtc = await RTCTax.local();
try {
  const regular = await rtc.regimeRegular.calculate({
    id: '6194602ea71cbf9431c236de4409d920', versao: '1.0.0',
    dhFatoGerador: '2027-03-10T10:00:00-03:00', municipio: 4314902, uf: 'RS',
    itens: [{ numero: 3, nbs: '122011200', cst: '200', cClassTrib: '200028', baseCalculo: '1200.00',
      aliquotasNominais: { cbs: '8.8', ibsEstadual: '0.05', ibsMunicipal: '0.05' } }]
  });
  const simples = await rtc.simplesNacional.calculate({
    id: '507f1f77bcf86cd799439011', versao: '2.0.0', data: '2027-03-15', tpDoc: '55', CRT: '1',
    itens: [{ numero: 1, cAtivSN: '01', cClassTrib: '000001', baseCalculo: '950.00',
      valorImpostoSeletivo: '50.00', pIBSSN: '1.25', pCBSSN: '2.75' }]
  });
  console.log(JSON.stringify({ regular, simples }, null, 2));
} finally { await rtc.close(); }
