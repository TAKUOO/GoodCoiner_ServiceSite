export interface FaqItem {
  question: string;
  answer: string;
  open?: boolean;
}

export const homeFaqs: FaqItem[] = [
  {
    question: "APIキーやトレードデータは安全ですか？",
    answer:
      "日記、取引データ、APIキーはGoodCoinerのサーバーへ送らず、端末内で管理します。口座同期はGMOコインへ、銘柄アイコンはCoinGeckoへ端末から直接アクセスします。",
    open: true,
  },
  {
    question: "GMOコイン以外の取引所にも対応していますか？",
    answer:
      "現在はGMOコイン向けに提供しています。対応取引所は今後順次拡張していく予定です。",
  },
  {
    question: "取引履歴・損益分析では何が見られますか？",
    answer:
      "保有銘柄ごとの損益や平均価格、評価損益、トレード結果の傾向などを確認できます。記録を見返しやすくして、判断の材料を整理するための機能です。",
  },
  {
    question: "iPhoneで注文できますか？",
    answer:
      "iPhoneでは利確・損切りの価格と予想損益を確認できます。注文や取消はPC版から行ってください。",
  },
  {
    question: "無料プランに期限はありますか？",
    answer:
      "ローカルの日記、損益、ルール管理は無料・無制限です。公式AIや同期などの有料サービスは準備中です。",
  },
];

export const usageFaqs: FaqItem[] = [
  {
    question: "APIキーは必要ですか？",
    answer:
      "はい。GMOコインの資産情報や取引履歴を取得するために必要です。",
    open: true,
  },
  {
    question: "注文の権限は必要ですか？",
    answer:
      "iPhoneで記録・同期・確認するだけなら参照専用キーで足ります。注文はPC版から行うため、参照専用キーで始めることをおすすめします。",
  },
  {
    question: "IPアドレス制限を使うときの注意点は？",
    answer:
      "利用端末のグローバルIPを登録してください。回線変更やVPN利用でIPが変わると接続できないことがあります。",
  },
  {
    question: "接続できないときは？",
    answer:
      "APIキー・APIシークレットの入力ミス、API権限、IPアドレス制限、GMOコインのメンテナンス、お手元のネットワークを確認してください。",
  },
  {
    question: "保存したAPIシークレットをあとから見られますか？",
    answer:
      "いいえ。安全のため、グッドコイナーでは保存済みのシークレットは再表示しません。変更する場合は、新しいAPIキー／APIシークレットを再入力してください。",
  },
  {
    question: "どの端末で使えますか？",
    answer:
      "iPhoneを主役に開発しています。PC版はmacOS 12 Ventura以降を想定し、Apple SiliconとIntelに対応します。iPhone版はTestFlight準備中です。",
  },
];

export const faqPageFaqs: FaqItem[] = [...homeFaqs, ...usageFaqs];
