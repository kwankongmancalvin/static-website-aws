import { Construct } from 'constructs';
import { 
  s3Bucket,
  //s3BucketServerSideEncryptionConfiguration,
  //s3BucketVersioning,
  s3BucketWebsiteConfiguration,
  s3Object,
  s3BucketPolicy,
  s3BucketPublicAccessBlock
} from "@cdktf/provider-aws";
import { readFileSync } from 'fs';
import { join } from 'path';

export interface WebsiteBucketConfig {
  readonly domainName: string;
  readonly deploymentTimestamp: string;
  readonly enableWebsiteHosting?: boolean;
  readonly tags?: Record<string, string>;
}

export class WebsiteBucket extends Construct {
  public readonly bucket: s3Bucket.S3Bucket;
  public readonly bucketObject: s3Object.S3Object;
  public readonly websiteEndpoint: string;
  public readonly bucketPolicy: s3BucketPolicy.S3BucketPolicy;

  constructor(scope: Construct, id: string, config: WebsiteBucketConfig) {
    super(scope, id);

    // Create S3 bucket
    this.bucket = new s3Bucket.S3Bucket(this, 'bucket', {
      bucket: config.domainName,
      forceDestroy: true,
      tags: {
        Name: config.domainName,
        DeploymentTimestamp: config.deploymentTimestamp,
        ...config.tags
      }
    });



    // Configure static website hosting
    const website = new s3BucketWebsiteConfiguration.S3BucketWebsiteConfiguration(
      this,
      'website_config',
      {
        bucket: this.bucket.id,
        indexDocument: {
          suffix: 'index.html'
        },
        errorDocument: {
          key: 'index.html'
        }
      }
    );
  
    this.websiteEndpoint = website.websiteEndpoint;
    
    // Block public access
    new s3BucketPublicAccessBlock.S3BucketPublicAccessBlock(
      this,
      'bucket_public_access_block',
      {
        bucket: this.bucket.id,
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true
      }
    );

    // Upload index.html with cache control
    const indexContent = readFileSync(
      join(__dirname, '../../static', 'index.html'),
      'utf8'
    ).replace('{{DEPLOYMENT_TIMESTAMP}}', config.deploymentTimestamp);

    this.bucketObject = new s3Object.S3Object(this, 'index_html', {
      bucket: this.bucket.id,
      key: 'index.html',
      content: indexContent,
      contentType: 'text/html',
      cacheControl: 'max-age=3600, public'
    });

    //Upload a custom error.html with cache control
    const errorContent = readFileSync(
      join(__dirname, '../../static', 'error.html'),
      'utf8'
    );

    this.bucketObject = new s3Object.S3Object(this, 'error_html', {
      bucket: this.bucket.id,
      key: 'error.html',
      content: errorContent,
      contentType: 'text/html',
      cacheControl: 'max-age=3600, public'
    });


    // Create empty bucket policy that will be updated later
    this.bucketPolicy = new s3BucketPolicy.S3BucketPolicy(this, 'bucket_policy', {
      bucket: this.bucket.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: []
      }),
    });
  }

  public get bucketArn(): string {
    return this.bucket.arn;
  }

  public get bucketName(): string {
    return this.bucket.bucket;
  }

  public get bucketRegionalDomainName(): string {
    return this.bucket.bucketRegionalDomainName;
  }
}