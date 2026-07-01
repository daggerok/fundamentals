# fundamentals
Fundamentals app using SEC free financial data API [article](https://dev.to/m0dus/the-sec-has-a-free-financial-data-api-that-nobody-talks-about-dfi)

<!-- https://arena.ai/c/019f1c6c-8842-7637-852c-fdba43e83e64 -->

1.
```bash
bunx local-cors-proxy --proxyUrl https://www.sec.gov  --port 8011
```

2.
```bash
bunx local-cors-proxy --proxyUrl https://data.sec.gov --port 8012
```

3.
```bash
bunx serve .
```

4.
```bash
open http://localhost:3000/
```

<!--

1.
```bash
bunx local-cors-proxy --proxyUrl https://data.sec.gov 
```

2.
```bash
bunx serve .
```

3.
```bash
open http://localhost:3000/
```

-->
