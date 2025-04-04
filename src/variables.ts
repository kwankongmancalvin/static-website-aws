// variables.ts
import { TerraformVariable, TerraformStack } from "cdktf";

export interface StaticWebsiteVariables {
  domainName: TerraformVariable;
  siteName: TerraformVariable;
  awsRegion: TerraformVariable;
  godaddyApiKey: TerraformVariable;
  godaddyApiSecret: TerraformVariable;
}

export function defineVariables(scope: TerraformStack): StaticWebsiteVariables {
  return {
    domainName: new TerraformVariable(scope, "domain_name", {
      type: "string",
      description: "The domain name for the static website",
      default: "kwanchekee.com"
    }),
    siteName: new TerraformVariable(scope, "site_name", {
      type: "string",
      description: "The Site name for the static website",
      default: "static-website"
    }),

    awsRegion: new TerraformVariable(scope, "aws_region", {
      type: "string",
      description: "AWS Region",
      default: "us-east-1"
    }),

    godaddyApiKey: new TerraformVariable(scope, "godaddy_api_key", {
      type: "string",
      description: "GoDaddy API key",
      sensitive: true
    }),

    godaddyApiSecret: new TerraformVariable(scope, "godaddy_api_secret", {
      type: "string",
      description: "GoDaddy API secret",
      sensitive: true
    })
  };
}