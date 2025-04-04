import { App, TerraformStack, TerraformOutput, Fn } from "cdktf";
import { Construct } from "constructs";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { WebsiteBucket } from "./modules/website-bucket";
import { WafIpRestriction } from "./modules/waf-ip-restriction";
import { AcmCertificateModule } from "./modules/acm-certificate";
import { CloudFrontDist } from "./modules/cloudfront-dist";
import { CustomRoute53Record } from "./modules/route53-record";
import { getIpAddressSync } from "./utils/ip-helper";
import { defineVariables, StaticWebsiteVariables } from "./variables";

class StaticWebsiteStack extends TerraformStack {
  public readonly variables: StaticWebsiteVariables;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Define all variables
    this.variables = defineVariables(this);

    // Configuration
    const yourIpAddress = getIpAddressSync(); // Change to your IP
    const deploymentTimestamp = new Date().toISOString();

    // AWS Providers - Need both default region and us-east-1 for WAF
    new AwsProvider(this, "aws_primary", {
      region: this.variables.awsRegion.value,
      alias: "primary"
    });

    // WAF for CloudFront must be in us-east-1
    new AwsProvider(this, "aws_us_east_1", {
      region: "us-east-1",
      alias: "us-east-1"
    });

    // 1. Create Route53 resources
    const route53 = new CustomRoute53Record(this, "route53", {
      domainName: this.variables.domainName.value,
      createHostedZone: true,
      distributionDomainName: "",
      distributionHostedZoneId: "",
    });

    // 2. Create certificate
    const certificate = new AcmCertificateModule(this, "certificate", {
      domainName: this.variables.domainName.value,
      hostedZoneId: route53.hostedZoneId,
    });

    // Create website bucket
    const websiteBucket = new WebsiteBucket(this, "website_bucket", {
      domainName: this.variables.domainName.value,
      deploymentTimestamp,
    });

    // Create WAF restriction with us-east-1 provider
    const waf = new WafIpRestriction(this, "waf_restriction", {
      ipAddress: yourIpAddress,
      webAclName: `${this.variables.siteName.value}-ip-restriction`,
      ipSetName: `${this.variables.siteName.value}-allowed-ips`
    });

    // Create CloudFront distribution
    const distribution = new CloudFrontDist(this, "cloudfront_dist", {
      domainName: this.variables.domainName.value,
      bucketDomainName: websiteBucket.bucketRegionalDomainName,
      certificateArn: certificate.outputs.validatedCertificateArn,
      webAclArn: waf.webAclArn, // This connects the WAF to CloudFront
    });

    // Update bucket policy for CloudFront access
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCloudFrontOAI",
          Effect: "Allow",
          Principal: {
            AWS: distribution.originAccessIdentity.iamArn
          },
          Action: "s3:GetObject",
          Resource: Fn.join("", [websiteBucket.bucketArn, "/*"])
        }
      ]
    };

    websiteBucket.bucketPolicy.policy = Fn.jsonencode(policy);

    // Update Route53 with CloudFront details
    route53.updateCloudFrontAlias(
      distribution.distribution.domainName,
      distribution.distribution.hostedZoneId
    );

    // Ensure proper dependency ordering
    route53.cloudfrontRecord.node.addDependency(distribution);

    // Outputs
    new TerraformOutput(this, "website_url", {
      value: `https://${this.variables.domainName.value}`,
    });

    new TerraformOutput(this, "allowed_ip_address", {
      value: yourIpAddress,
      description: "The IP address granted access via WAF"
    });
  }
}

const app = new App();
new StaticWebsiteStack(app, "static-website");
app.synth();