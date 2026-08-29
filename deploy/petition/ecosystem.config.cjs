module.exports = {
  apps: [
    {
      name: "gekas-stats-api",
      script: "server.js",
      cwd: "/var/www/gekas-stats-api",
      env: {
        PORT: 3010,
        DATABASE_URL: "postgresql://gekas:gekas_petition_2026@127.0.0.1:55437/gekas_petition",
        UMAMI_URL: "http://127.0.0.1:3000",
        UMAMI_USER: "admin",
        UMAMI_PASS: "GekasStats2026!Secure",
        WEBSITE_ID: "c92b66b9-3b10-4b1b-a36c-74e99b0ba379",
        PUBLIC_SITE: "https://gekas-security.com",
      },
    },
  ],
};
