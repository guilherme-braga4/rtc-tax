/** Decimal text avoids converting fiscal values to IEEE-754 numbers. */
export type Decimal = string;
export type JsonValue = null | boolean | string | number | JsonValue[] | { [key: string]: JsonValue };
export interface RegularItem {
  numero: number; cst: string; cClassTrib: string; ncm?: string; nbs?: string;
  baseCalculo?: Decimal; quantidade?: Decimal; unidade?: string;
  aliquotasNominais?: { cbs?: Decimal; ibsEstadual?: Decimal; ibsMunicipal?: Decimal; impostoSeletivo?: { adValorem?: Decimal; adRem?: Decimal } };
  impostoSeletivo?: { cst: string; cClassTrib: string; baseCalculo?: Decimal; quantidade?: Decimal; unidade?: string; impostoInformado?: Decimal };
}
/** Supported subset of the pinned Regime Regular contract. */
export interface RegularOperation {
  id: string; versao: string; dhFatoGerador: string; municipio: number; uf?: string; tpDoc?: number; itens: RegularItem[];
}
export interface SimplesItem {
  numero: number; cAtivSN?: string; cClassTrib: string; baseCalculo: Decimal;
  valorImpostoSeletivo: Decimal; pIBSSN?: Decimal; pCBSSN?: Decimal;
}
export interface SimplesOperation {
  id: string; versao: string; data: string; tpDoc: string; CRT: string;
  tpRegimeIBSCBS?: string; tpEnteGov?: string; itens: SimplesItem[];
}
export interface RegularTaxGroup {
  vBC?: Decimal;
  gIBSUF?: { pIBSUF?: Decimal; vIBSUF?: Decimal; gRed?: { pRedAliq?: Decimal; pAliqEfet?: Decimal } };
  gIBSMun?: { pIBSMun?: Decimal; vIBSMun?: Decimal; gRed?: { pRedAliq?: Decimal; pAliqEfet?: Decimal } };
  vIBS?: Decimal;
  gCBS?: { pCBS?: Decimal; vCBS?: Decimal; gRed?: { pRedAliq?: Decimal; pAliqEfet?: Decimal } };
}
export interface RegularResult {
  objetos: Array<{ nObj: number; tribCalc?: { IBSCBS?: { CST?: string; cClassTrib?: string; gIBSCBS?: RegularTaxGroup }; IS?: JsonValue }; calculoSimulado?: boolean }>;
  total?: { [key: string]: JsonValue };
}
export interface SimplesTaxResult {
  vRBSNitem?: Decimal; tpRBSN?: number; tpRBSNDescricao?: string; vBC?: Decimal;
  pIBSSN?: Decimal; vIBSSN?: Decimal; vIBSPendSusp?: Decimal;
  pCBSSN?: Decimal; vCBSSN?: Decimal; vCBSPendSusp?: Decimal;
  memoriaCalculo?: { cbs?: string; ibs?: string };
  IS?: { valor?: Decimal }; totalItem?: Decimal;
}
export interface SimplesResult {
  oper: { [key: string]: JsonValue };
  objetos: Array<{ nObj: number; estadoItem: string; tribCalc?: SimplesTaxResult; erros?: JsonValue[] }>;
  total?: { [key: string]: JsonValue };
}
export type Engine = 'regular' | 'simples';
export interface RemoteOptions { regimeRegularUrl: string; simplesNacionalUrl: string; timeoutMs?: number; headers?: Record<string, string> }
export interface LocalOptions { timeoutMs?: number; startupTimeoutMs?: number }
