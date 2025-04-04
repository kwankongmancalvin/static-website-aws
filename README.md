# Terraform Typescript Static Website IaC Project

**AWS frontend infrastructure**, includes: 

- 🏢 [S3](https://aws.amazon.com/s3/) - storage for static assets
- 🛰 [Cloudfront](https://aws.amazon.com/cloudfront/) - cdn
- 🗿 [AWS Certificate Manager](https://aws.amazon.com/certificate-manager/) - SSL certificate
- 🚏 [Route 53](https://aws.amazon.com/route53/) - DNS/Domain setup

## Project Structure

## How to

- Install dependencies:
```
npm i
```

- Environment Variables Preparation - For GoDaddy API
```
export TF_VAR_godaddy_api_key=<your godaddy api key>
export TF_VAR_godaddy_api_secret=<your godaddy api secret>
```

- Terraform Variables file
```
domain_name = "<your godaddy domain>"
site_name = "<your site name>"
aws_region = "<AWS region name>"
```


- Run terraform
```
cdktf synth
cdktf deploy
```

- Destroy Built
```
cdktf destory
``` 