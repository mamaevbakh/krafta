export default function PayReturnPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Payment processing</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your payment request is being processed. You can close this window if it does not redirect automatically.
        </p>
      </div>
    </div>
  );
}
