export async function handleLink(body, db, env) {
  // Phase 3 fills this in: ONNX result comes from client, this handles server-side blocklist check + signal recording
  return Response.json({ status: 'not_implemented', module: 'link' }, { status: 501 });
}

export async function ingestBlocklists(db, env) {
  // Phase 3 fills this in: OpenPhish + URLhaus daily cron ingestion
  // Sources:
  //   OpenPhish  — https://openphish.com/feed.txt      (no key, plain text)
  //   URLhaus    — https://urlhaus-api.abuse.ch/v1/urls/recent/limit/1000/  (no key, JSON)
  // PhishTank dropped — closed to new registrations as of 2024
}
