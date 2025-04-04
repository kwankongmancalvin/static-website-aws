import { Construct } from 'constructs';
import { AcmCertificate } from '@cdktf/provider-aws/lib/acm-certificate';
import { Route53Record } from '@cdktf/provider-aws/lib/route53-record';
import { AcmCertificateValidation } from '@cdktf/provider-aws/lib/acm-certificate-validation';

export interface AcmCertificateConfig {
  readonly domainName: string;
  readonly hostedZoneId: string;
  readonly subjectAlternativeNames?: string[];
  readonly tags?: Record<string, string>;

}

export interface AcmCertificateOutput {
  certificateArn: string;
  validatedCertificateArn: string;
}

export class AcmCertificateModule extends Construct {
  public readonly outputs: AcmCertificateOutput;

  constructor(scope: Construct, id: string, config: AcmCertificateConfig) {
    super(scope, id);

    // Create ACM certificate
    const certificate = new AcmCertificate(this, 'certificate', {
      domainName: config.domainName,
      subjectAlternativeNames: config.subjectAlternativeNames,
      validationMethod: 'DNS',
      tags:config.tags

    });

    // Create validation records
    // Note: Using the FQN property access pattern for CDKTF list types
    const options = certificate.domainValidationOptions;
      const option = options.get(0);
      new Route53Record(this, `cert_validation_record_0`, {
        zoneId: config.hostedZoneId,
        name: option.resourceRecordName,
        type: option.resourceRecordType,
        records: [option.resourceRecordValue],
        ttl: 300,
      });
    

    // Wait for validation
    const validation = new AcmCertificateValidation(this, 'validation', {
      certificateArn: certificate.arn,
    });

    this.outputs = {
      certificateArn: certificate.arn,
      validatedCertificateArn: validation.certificateArn,
    };
  }
}