# Email OTP da Fings para Loops

## Importar no Loops

1. Cria um email do tipo **Transactional**.
2. Escolhe a opção de estilo por código e importa `fings-otp-loops.zip`.
3. Confirma que o Loops detetou a variável obrigatória `otpCode`.
4. Usa como assunto: `O teu código de acesso à Fings`.
5. Usa como preview text: `O teu código de acesso está pronto. É válido apenas durante alguns minutos.`
6. Publica o email e copia o respetivo `transactionalId`.

O ficheiro `fings-otp.mjml` é a fonte editável. O ficheiro `fings-otp-preview.html` serve apenas para pré-visualização local; mostra o código fictício `482913`.

## Payload de envio

```json
{
  "transactionalId": "SUBSTITUIR_PELO_ID_DO_LOOPS",
  "email": "utilizador@exemplo.pt",
  "dataVariables": {
    "otpCode": "482913"
  }
}
```

Endpoint: `POST https://app.loops.so/api/v1/transactional`

`otpCode` é obrigatório e sensível a maiúsculas/minúsculas. Envia-o como string para preservar eventuais zeros à esquerda.
