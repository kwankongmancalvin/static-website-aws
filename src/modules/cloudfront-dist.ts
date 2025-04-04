import { Construct } from "constructs";
import {
  cloudfrontDistribution,
  cloudfrontOriginAccessIdentity,
} from "@cdktf/provider-aws";
import { TerraformOutput } from "cdktf";

export interface CloudFrontDistConfig {
  readonly domainName: string;
  readonly bucketDomainName: string;
  readonly certificateArn: string;
  readonly webAclArn?: string;
  readonly tags?: Record<string, string>;

}

export class CloudFrontDist extends Construct {
  public readonly distribution: cloudfrontDistribution.CloudfrontDistribution;
  public readonly originAccessIdentity: cloudfrontOriginAccessIdentity.CloudfrontOriginAccessIdentity;
  public readonly oaiIamArn: string;

  constructor(scope: Construct, id: string, config: CloudFrontDistConfig) {
    super(scope, id);



    // Create Origin Access Identity (OAI)
    this.originAccessIdentity = new cloudfrontOriginAccessIdentity.CloudfrontOriginAccessIdentity(
      this,
      "origin_access_identity",
      {
        comment: `OAI for ${config.domainName}`
      }
    );
    this.oaiIamArn = this.originAccessIdentity.iamArn;

    // Create CloudFront Distribution
    this.distribution = new cloudfrontDistribution.CloudfrontDistribution(this, "distribution", {
      enabled: true,
      aliases: [config.domainName],
      defaultRootObject: "index.html",
      httpVersion: "http2and3",
      isIpv6Enabled: true,
      priceClass: "PriceClass_100",
      waitForDeployment: true,

      origin: [
        {
          originId: "s3-static-id",
          domainName: config.bucketDomainName,
          s3OriginConfig: {
            originAccessIdentity: this.originAccessIdentity.cloudfrontAccessIdentityPath
          }
        },
      ],

      defaultCacheBehavior: {
        allowedMethods: ["GET", "HEAD", "OPTIONS"],
        cachedMethods: ["GET", "HEAD", "OPTIONS"],
        targetOriginId: "s3-static-id",
        viewerProtocolPolicy: "redirect-to-https",
        compress: true,
        cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
        originRequestPolicyId: "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf",
        responseHeadersPolicyId: "67f7725c-6f97-4210-82d7-5512b31e9d03",
      },

      restrictions: {
        geoRestriction: {
          restrictionType: "none",
        },
      },

      viewerCertificate: {
        acmCertificateArn: config.certificateArn,
        sslSupportMethod: "sni-only",
        minimumProtocolVersion: "TLSv1.2_2021",
      },

      webAclId: config.webAclArn,

      customErrorResponse: [
        {
          errorCode: 403,
          responseCode: 200,
          responsePagePath: "/error.html",
        },
        {
          errorCode: 404,
          responseCode: 200,
          responsePagePath: "/error.html",
        },
      ],
      tags: config.tags
    });

    // Outputs
    new TerraformOutput(this, "cloudfront_distribution_id", {
      value: this.distribution.id,
    });

    new TerraformOutput(this, "cloudfront_domain_name", {
      value: this.distribution.domainName,
    });

    new TerraformOutput(this, "origin_access_identity_iam_arn", {
      value: this.originAccessIdentity.iamArn,
    });
  }
}