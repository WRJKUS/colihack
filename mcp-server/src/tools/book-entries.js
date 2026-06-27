export async function bookEntries({ total_excl_vat, vat_amount, total_incl_vat, buyer_name }) {
  return {
    date: new Date().toISOString().split("T")[0],
    description: `Invoice to ${buyer_name}`,
    entries: [
      { account: "400", name: "Accounts Receivable", type: "debit",  amount: total_incl_vat },
      { account: "700", name: "Revenue",              type: "credit", amount: total_excl_vat },
      { account: "451", name: "VAT Payable",          type: "credit", amount: vat_amount }
    ]
  };
}
