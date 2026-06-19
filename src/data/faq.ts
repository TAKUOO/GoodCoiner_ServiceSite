export interface FaqItem {
  question: string;
  answer: string;
  open?: boolean;
}

export const homeFaqs: FaqItem[] = [
  {
    question: "APIキーやトレードデータは安全ですか？",
    answer:
      "はい。グッドコイナーでは、APIキーやトレードデータを外部サーバーに送信せず、お使いのデバイス内で管理します。第三者にデータが渡る前提の設計ではありません。",
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
    question: "利確予約では何ができますか？",
    answer:
      "目標利益額を決めて、決めたルールに沿った利確の準備ができます。感情に引っ張られず、あらかじめ決めた行動に寄せるための機能です。",
  },
  {
    question: "無料プランに期限はありますか？",
    answer:
      "無料プランに期限はありません。まずは試してから、有料プランへ切り替えることができます。",
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
      "資産や履歴の確認だけなら参照系の権限で足ります。利確予約など注文機能を使う場合は、注文系の権限が別途必要です。",
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
    question: "どのmacOSバージョンに対応していますか？",
    answer:
      "現時点ではmacOS 12 Ventura以降を想定しています。Apple Silicon と Intel の両方に対応しています。",
  },
];

export const faqPageFaqs: FaqItem[] = [...homeFaqs, ...usageFaqs];
